import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause, Plus, X, FileUp, Download, Activity } from 'lucide-react';
import SelectMenu from './SelectMenu.jsx';
import { espJson } from './lib/espTransport.js';
import { createGlobalWatch, globalWatchCsv, variableId, resolveWatchName } from './lib/globalWatch.js';
import { DEFAULT_SETTINGS } from './lib/settings.js';
import { reloadWatchFirmware } from './lib/watchFirmware.js';

const labels = { idle: 'Hazır', verifying: 'Doğrulanıyor', programming: 'Yükleniyor', live: 'Canlı', paused: 'Durduruldu', retrying: 'Bağlantı kontrolü', error: 'İzleme durdu' };
const valueText = v => !v?.valid ? '—' : v.kind === 'bool' ? v.value ? 'true' : 'false' : typeof v.value === 'number' ? v.value.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : v.value;
function Sparkline({ frames, id }) {
  const points = frames.map(frame => frame.values.find(v => v.id === id)).map(v => v?.valid && Number.isFinite(v.value) ? v.value : null);
  const values = points.filter(v => v !== null);
  if (values.length < 2) return <p className="watch-chart-empty">Grafik için sayısal örnek bekleniyor</p>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  let pen = false;
  const path = points.map((v, i) => { if (v === null) { pen = false; return ''; } const part = `${pen ? 'L' : 'M'}${(i / Math.max(1, points.length - 1) * 600).toFixed(2)},${(95 - (v - min) / range * 80).toFixed(2)}`; pen = true; return part; }).join(' ');
  return <div className="watch-chart"><svg viewBox="0 0 600 110" role="img" aria-label="Global değişken zaman grafiği"><path d={path}/></svg><small>Min {min.toLocaleString('tr-TR')} · Max {max.toLocaleString('tr-TR')}</small></div>;
}
export default function GlobalWatch({ documentId, initialData, active, services }) {
  const { esp, target, activeBridge, hardware, hardwareBusy, setNotice, debugArtifact } = services;
  const preferences = services.preferences || DEFAULT_SETTINGS;
  const [elf, setElf] = useState(null), [fileName, setFileName] = useState(''), [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(''), [choice, setChoice] = useState(''), [selected, setSelected] = useState([]);
  const [inputError, setInputError] = useState('');
  const [state, setState] = useState({ status: 'idle', message: 'Karta yüklenen yazılımın ELF’ini seç, ardından global değişken ekle.' });
  const [frames, setFrames] = useState([]), [latest, setLatest] = useState(null), [interval, setIntervalMs] = useState(String(preferences.intervalMs));
  const [exporting, setExporting] = useState(false), [now, setNow] = useState(Date.now);
  const controller = useRef(null), alive = useRef(true), importId = useRef(0), history = useRef([]), limit = useRef(preferences.recordLimit);
  const uploadedFile = useRef(null), loadedSource = useRef('manual');
  const fileRef = useRef(null);
  const running = ['verifying', 'programming', 'live', 'retrying'].includes(state.status);
  const uid = initialData?.uid || target?.uid;
  const stop = message => controller.current?.stop(message);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++importId.current; stop(); }; }, []);
  useEffect(() => { if (!active || esp.status !== 'online') stop(!active ? 'Sekme arka planda; okuma durduruldu.' : 'ESP32 bağlantısı kesildi.'); }, [active, esp.status]);
  useEffect(() => () => stop('ESP adresi değişti; okuma durduruldu.'), [activeBridge]);
  useEffect(() => { if (running) { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); } }, [running]);
  useEffect(() => { if (!running) setIntervalMs(String(preferences.intervalMs)); }, [preferences.intervalMs]);
  useEffect(() => { stop('Hedef değişti; okuma durduruldu.'); setLatest(null); setFrames([]); }, [target?.uid]);
  const load = async (file, source = 'manual') => {
    if (!file || running || hardware.current) return;
    const id = ++importId.current; setLoading(true); setElf(null); setSelected([]); setInputError(''); setQuery(''); setLatest(null); setFrames([]); history.current = [];
    loadedSource.current = source;
    fileRef.current = file;
    try {
      if (!/\.elf$/i.test(file.name) || file.size > 16 * 1024 * 1024) throw new Error('Debug bilgili .ELF seç; en fazla 16 MB. BIN değişken adlarını taşımaz.');
      if (!window.__TAURI_INTERNALS__) throw new Error('ELF çözümleme masaüstü uygulamasında kullanılabilir.');
      const info = await invoke('inspect_watch_elf', { bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
      if (!alive.current || id !== importId.current) return;
      setElf(info); setFileName(file.name); setChoice(info.variables[0] ? variableId(info.variables[0]) : '');
      setState({ status: 'idle', message: `${info.variables.length} RAM değişkeni bulundu. İzleme başlatıldığında flash eşleşmesi kontrol edilir.` });
    } catch (error) { if (alive.current && id === importId.current) setState({ status: 'error', message: error.message || String(error) }); }
    finally { if (alive.current && id === importId.current) setLoading(false); }
  };
  useEffect(() => {
    const file = debugArtifact?.file;
    if (!file) {
      if (uploadedFile.current && loadedSource.current === 'upload') {
        ++importId.current; setLoading(false); setElf(null); setFileName(''); setSelected([]); setLatest(null); setFrames([]); history.current = [];
        setState({ status: 'idle', message: 'Son yükleme için ELF yok. İstersen aynı derlemenin ELF’ini seç.' });
      }
      uploadedFile.current = null;
      return;
    }
    if (file !== uploadedFile.current && !loading && active && !hardware.current && !running) {
      uploadedFile.current = file;
      void load(file, 'upload');
    }
  }, [debugArtifact, active, hardwareBusy, loading, running]);
  const filtered = (elf?.variables || []).filter(v => !selected.includes(variableId(v)) && `${v.name} ${v.typeName}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  const chosen = filtered.find(v => variableId(v) === choice) || filtered[0];
  const variables = (elf?.variables || []).filter(v => selected.includes(variableId(v)));
  const start = async (nextVariables = variables) => {
    try {
      if (!active || esp.status !== 'online' || !activeBridge || !target?.connected) throw new Error('Önce ESP32 ve STM32’ye bağlan.');
      if (!esp.programmer?.watchAvailable) throw new Error('Global değişken izlemek için ESP firmware’ini güncelle.');
      if (uid !== target.uid) throw new Error('Bu ekran başka STM32’ye ait.');
      history.current = []; setFrames([]); setLatest(null); limit.current = preferences.recordLimit;
      const session = createGlobalWatch({ hardware, ownerId: documentId, uid, elf, variables: nextVariables, intervalMs: Number(interval),
        verify: () => espJson(activeBridge, '/api/watch/verify', { method: 'POST', body: { uid, sha256: elf.imageSha256, size: String(elf.imageSize) }, timeoutMs: 40000 }),
        reloadFirmware: (lease, isStopped) => reloadWatchFirmware({ hardware, lease, isStopped, file: fileRef.current,
          uid, model: target.model, base: activeBridge, imageSha256: elf.imageSha256, imageSize: elf.imageSize,
          onNotice: setNotice,
          onProgress: next => { if (alive.current && !isStopped()) setState(next); },
          onLoaded: (id, file) => { uploadedFile.current = file; loadedSource.current = 'upload'; services.onFirmwareLoaded?.(id, file); },
        }),
        read: (token, vars) => espJson(activeBridge, '/api/watch/read', { method: 'POST', body: { uid, session: token, addresses: vars.map(v => `${v.address}:${v.size}`).join(',') }, timeoutMs: 40000 }),
        onState: next => { if (alive.current) setState(next); if (next.status === 'error') setNotice(`İzleme başarısız: ${next.message}`); },
        onFrame: frame => { if (!alive.current) return; setLatest(frame); setNow(Date.now()); setFrames(current => [...current.slice(-239), frame]); if (history.current.length < limit.current) history.current.push(frame); },
      });
      controller.current = session; await session.start();
    } catch (error) { if (alive.current) setState({ status: 'error', message: error.message || String(error) }); }
  };
  const addVariable = async variable => {
    try {
      if (!variable) throw new Error('Bir değişken adı yaz.');
      const id = variableId(variable);
      if (selected.includes(id)) throw new Error('Bu değişken zaten izleme listesinde.');
      if (selected.length >= 16) throw new Error('Aynı anda en fazla 16 değişken izlenebilir.');
      const next = [...variables, variable];
      if (running) controller.current.updateVariables(next);
      setSelected(current => [...current, id]); setQuery(''); setInputError('');
      if (!running) await start(next);
    } catch (error) { setInputError(error.message || String(error)); }
  };
  const submitExpression = async event => {
    event.preventDefault();
    try { await addVariable(resolveWatchName(elf, query)); }
    catch (error) { setInputError(error.message || String(error)); }
  };
  const removeVariable = id => {
    const next = variables.filter(v => variableId(v) !== id);
    if (running) { if (next.length) controller.current.updateVariables(next); else stop(); }
    setSelected(current => current.filter(value => value !== id));
  };
  const exportCsv = async () => {
    setExporting(true);
    try { const path = await invoke('telemetry_export_csv', { csv: globalWatchCsv(history.current), directory: preferences.exportDirectory || null }); setNotice(`Değişken kaydı: ${path}`); }
    catch (error) { setNotice(`CSV kaydedilemedi: ${error.message || error}`); }
    finally { if (alive.current) setExporting(false); }
  };
  const fresh = state.status === 'live' && latest && now - latest.receivedAt <= Math.max(2500, Number(interval) * 3);
  const automaticLabel = debugArtifact?.status === 'selected' ? 'Seçilen ELF' : 'Son yüklenen ELF';
  return <div className="live-monitor global-watch">
    <header className="live-heading"><div><h1>Live Expressions</h1><p>{target?.label || target?.model || 'STM32'}</p></div><span className={`live-status status-${state.status}`}><i/>{fresh || state.status !== 'live' ? labels[state.status] : 'Okuma bekleniyor'}</span></header>
    <div className="watch-source"><label className="secondary"><FileUp size={16}/>{loading ? 'ELF OKUNUYOR…' : elf ? 'ELF DEĞİŞTİR' : 'ELF SEÇ'}<input aria-label="İzleme ELF dosyası" type="file" accept=".elf" disabled={running || loading || Boolean(hardwareBusy)} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }}/></label>{elf && <span>{fileName} · {loadedSource.current === 'upload' ? `${automaticLabel} · ` : ''}{elf.variables.length} değişken</span>}{debugArtifact?.file && loadedSource.current === 'manual' && <button className="secondary" disabled={running || loading || Boolean(hardwareBusy)} onClick={() => { uploadedFile.current = debugArtifact.file; void load(debugArtifact.file, 'upload'); }}>HIZLI YÜKLEME ELF’İ</button>}</div>
    {elf && <div className="watch-entry"><form className="watch-expression" onSubmit={submitExpression}><input aria-label="Global değişken ara" placeholder="Değişken adı yaz ve Enter’a bas" autoComplete="off" spellCheck={false} value={query} disabled={loading || ['verifying', 'programming', 'retrying'].includes(state.status) || Boolean(hardwareBusy && !running)} onChange={e => { setQuery(e.target.value); setInputError(''); }}/><button className="secondary" type="submit" disabled={!query.trim() || selected.length >= 16 || loading || ['verifying', 'programming', 'retrying'].includes(state.status) || Boolean(hardwareBusy && !running)} aria-label="Değişkeni ekle ve izle"><Plus size={16}/></button></form>{inputError && <p role="alert" className="watch-input-error">{inputError}</p>}<details className="watch-picker"><summary>ELF’ten seç · {elf.variables.length}</summary><fieldset className="watch-add" disabled={loading || ['verifying', 'programming', 'retrying'].includes(state.status) || Boolean(hardwareBusy && !running)}><SelectMenu ariaLabel="İzlenecek global değişken" value={chosen ? variableId(chosen) : ''} options={filtered.map(v => ({ value: variableId(v), label: `${v.name} · ${v.typeName} · 0x${v.address.toString(16)}` }))} onChange={setChoice}/><button className="secondary" disabled={!chosen || selected.length >= 16} onClick={() => void addVariable(chosen)}><Plus size={15}/> EKLE</button></fieldset></details></div>}
    <div className="live-toolbar"><button className={running ? 'secondary' : 'primary'} disabled={!running && (!elf || !selected.length || !active || esp.status !== 'online' || !uid || Boolean(hardwareBusy))} onClick={running ? () => stop() : () => start()}>{running ? <Pause size={15}/> : <Play size={15}/>} {running ? 'DURDUR' : 'İZLEMEYİ BAŞLAT'}</button><fieldset className="live-rate" disabled={running}><SelectMenu ariaLabel="Değişken okuma aralığı" value={interval} options={[{ value: '250', label: '250 ms' }, { value: '500', label: '500 ms' }, { value: '1000', label: '1 saniye' }]} onChange={setIntervalMs}/></fieldset><button className="secondary" disabled={!history.current.length || exporting} onClick={exportCsv}><Download size={15}/> CSV</button><span>{history.current.length} / {limit.current} kayıt</span></div>
    <p role="status" className={`live-message ${state.status === 'error' ? 'is-error' : ''}`}>{state.message}</p>
    {state.status === 'programming' && <div><progress aria-label="ELF yükleme ilerlemesi" max="100" value={state.progress}/>{Number.isFinite(state.progress) && <span> %{Math.round(state.progress)}</span>}<p className="live-update-note">İzlemeyi durdurmak başlamış flash yazımını kesmez; güvenli tamamlanması beklenir.</p></div>}
    {elf && <p className="live-update-note">ELF farklıysa izlemeye başlamadan önce karta yüklenir.</p>}
    {!esp.programmer?.watchAvailable && <p className="live-update-note">Bu özellik için güncel ESP firmware’i gerekir.</p>}
    <div className="live-channels">{variables.map(variable => { const v = latest?.values.find(v => v.id === variableId(variable)); return <article className={`live-channel ${fresh && v?.valid ? 'channel-live' : 'channel-inactive'}`} key={variableId(variable)}><div className="live-channel-heading"><div><h2>{variable.name}</h2><small>{variable.typeName} · 0x{variable.address.toString(16)} · {variable.size} bayt</small></div><div className="live-value"><strong>{valueText(v)}</strong><small>{fresh && v?.valid ? 'CANLI' : v && !v.valid ? 'TUTARSIZ / GEÇERSİZ OKUMA' : 'SON OKUMA'}</small></div><button className="watch-remove" aria-label={`${variable.name} izlemeyi kaldır`} disabled={['verifying', 'programming'].includes(state.status)} onClick={() => removeVariable(variableId(variable))}><X size={15}/></button></div><details className="watch-graph"><summary>Grafik</summary><Sparkline frames={frames} id={variableId(variable)}/></details></article>; })}{!variables.length && <div className="live-empty"><Activity size={28}/><h2>Değişken adını yaz</h2><p>Enter ile izle · en fazla 16 değişken</p></div>}</div>
    <details className="watch-session"><summary>Oturum bilgisi</summary><p>Hedef UID: {uid || '—'}</p><p className="live-footnote">İzleme sırasında çekirdek durdurulmaz; otomatik yazılım yükleme hedefi yeniden başlatır. Okumalar örneklemelidir, değişkenlerin tamamı aynı anda okunmaz. 64-bit değerler iki kez karşılaştırılır; bu atomik snapshot garantisi değildir. Flash SHA-256 başlangıçta ve 5 saniyede bir yeniden kontrol edilir. Büyük firmware’de kontrol okuma aralığını uzatabilir. Pointer, dizi, struct ve yerel stack değişkenleri henüz desteklenmez.</p></details>
  </div>;
}
