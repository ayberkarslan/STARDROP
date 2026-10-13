import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause, Plus, X, FileUp, Download, Activity, Settings } from 'lucide-react';
import Popup from './Popup.jsx';
import SelectMenu from './SelectMenu.jsx';
import { espJson } from './lib/espTransport.js';
import { createGlobalWatch, globalWatchCsv, variableId, resolveWatchName, watchFreshness } from './lib/globalWatch.js';
import { DEFAULT_SETTINGS } from './lib/settings.js';
import { reloadWatchFirmware } from './lib/watchFirmware.js';
import { inspectWatchFile } from './lib/watchElfImport.js';
import { watchDraft, saveWatchDraft, rememberWatchElf, recalledWatchSession, rememberWatchSelection, firmwareHistory } from './lib/watchMemory.js';

const labels = { idle: 'Hazır', verifying: 'ELF kontrolü', programming: 'Yükleniyor', reading: 'RAM bekleniyor', stopping: 'Durduruluyor', live: 'Canlı', paused: 'Durduruldu', retrying: 'Bağlantı kontrolü', error: 'İzleme durdu' };
const valueText = v => !v?.valid ? '—' : v.kind === 'bool' ? v.value ? 'true' : 'false' : typeof v.value === 'number' ? v.value.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : v.value;
// The small freshness clock re-renders only this indicator, not every chart
// and variable card. It uses real RAM replies, not extra heartbeat requests.
function WatchSignal({ state, latest, interval, connected }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (state.status !== 'live') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [state.status]);
  const { ageMs, fresh } = watchFreshness(latest, Math.max(now, latest?.receivedAt || 0), interval);
  const live = state.status === 'live';
  return <div className="watch-signal" aria-label="RAM bağlantı durumu" title="Son başarılı RAM yanıtı bağlantıyı doğrular. Yanıt süresi Wi-Fi, HTTP, SWD ve varsa flash kontrolünü içerir; anlık fiziksel kopma garantisi değildir.">
    <span className={`live-status status-${live && !fresh ? 'waiting' : state.status}`}><i/>{state.status === 'idle' ? connected ? 'Bağlı' : 'Bağlı değil' : live ? fresh ? 'Canlı' : 'Yanıt gecikti' : labels[state.status]}</span>
    {latest && <small>{live ? `Son yanıt ${Math.round(ageMs)} ms önce` : 'Son okuma saklandı'} · {latest.readDurationMs} ms yanıt</small>}
    {live && state.pending && now - state.pendingSince >= 2000 && <small className="watch-pending" role="status">Yeni RAM yanıtı bekleniyor · {Math.floor((now - state.pendingSince) / 1000)} sn</small>}
  </div>;
}
function Sparkline({ frames, id }) {
  const points = frames.map(frame => frame.values.find(v => v.id === id)).map(v => v?.valid && Number.isFinite(v.value) ? v.value : null);
  const values = points.filter(v => v !== null);
  if (values.length < 2) return <p className="watch-chart-empty">Grafik için sayısal örnek bekleniyor</p>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  let pen = false;
  const path = points.map((v, i) => { if (v === null) { pen = false; return ''; } const part = `${pen ? 'L' : 'M'}${(i / Math.max(1, points.length - 1) * 600).toFixed(2)},${(95 - (v - min) / range * 80).toFixed(2)}`; pen = true; return part; }).join(' ');
  return <div className="watch-chart"><svg viewBox="0 0 600 110" role="img" aria-label="Global değişken zaman grafiği"><path d={path}/></svg><small>Min {min.toLocaleString('tr-TR')} · Max {max.toLocaleString('tr-TR')}</small></div>;
}
function WatchGraph({ frames, id }) {
  const [open, setOpen] = useState(false);
  return <details className="watch-graph" onToggle={event => setOpen(event.currentTarget.open)}><summary>Grafik</summary>{open && <Sparkline frames={frames} id={id}/>}</details>;
}
export default function GlobalWatch({ documentId, initialData, active, services, telemetryPanel }) {
  const { esp, target, activeBridge, hardware, hardwareBusy, setNotice, debugArtifact } = services;
  const preferences = services.preferences || DEFAULT_SETTINGS;
  const boundUid = useRef(initialData?.uid || target?.uid);
  const uid = initialData?.uid || target?.uid || boundUid.current;
  if (uid) boundUid.current = uid;
  const saved = useRef(watchDraft(documentId, uid));
  if (saved.current?.revision !== (firmwareHistory(uid).at(-1)?.id || null)) saved.current = null;
  const [elf, setElf] = useState(saved.current?.elf || null), [fileName, setFileName] = useState(saved.current?.file?.name || ''), [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(''), [choice, setChoice] = useState(''), [selected, setSelected] = useState(saved.current?.selected || []);
  const [inputError, setInputError] = useState('');
  const [state, setState] = useState({ status: 'idle', message: 'Karta yüklenen yazılımın ELF’ini seç, ardından global değişken ekle.' });
  const [frames, setFrames] = useState([]), [latest, setLatest] = useState(null), [interval, setIntervalMs] = useState(String(preferences.watchIntervalMs ?? 250));
  const [exporting, setExporting] = useState(false), [now, setNow] = useState(Date.now);
  const controller = useRef(null), alive = useRef(true), importId = useRef(0), history = useRef([]), limit = useRef(preferences.recordLimit);
  const uploadedFile = useRef(saved.current?.file && saved.current.file === debugArtifact?.file ? debugArtifact.file : null), loadedSource = useRef(saved.current?.source || 'manual');
  const fileRef = useRef(saved.current?.file || null), loadedRevision = useRef(saved.current?.revision || null), loadedUid = useRef(uid);
  const seenUid = useRef(uid), restoredUid = useRef(null);
  const [drawer, setDrawer] = useState(false), [telemetryOpen, setTelemetryOpen] = useState(false);
  const starting = useRef(false);
  const running = ['verifying', 'programming', 'reading', 'stopping', 'live', 'retrying'].includes(state.status);
  const transition = next => setState(previous => ({ ...next,
    since: previous.status === next.status ? previous.since : Date.now(),
    pendingSince: next.pending ? previous.pending ? previous.pendingSince : Date.now() : null }));
  const stop = message => controller.current?.stop(message);
  // StrictMode replays effects on first mount. Keep the same pending import
  // valid across that replay; real unmounts are guarded by alive=false.
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, []);
  useEffect(() => { if (!active || telemetryOpen || esp.status !== 'online') stop(!active || telemetryOpen ? 'Sekme arka planda; okuma durduruldu.' : 'ESP32 bağlantısı kesildi.'); if (!active) { setDrawer(false); setTelemetryOpen(false); } }, [active, telemetryOpen, esp.status]);
  useEffect(() => () => stop('ESP adresi değişti; okuma durduruldu.'), [activeBridge]);
  useEffect(() => { if (running) { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); } }, [running]);
  useEffect(() => { if (!running) setIntervalMs(String(preferences.watchIntervalMs ?? 250)); }, [preferences.watchIntervalMs]);
  useEffect(() => {
    if (uid === seenUid.current) return;
    seenUid.current = uid; ++importId.current; stop('Hedef değişti; okuma durduruldu.');
    setLoading(false); setElf(null); setFileName(''); setSelected([]); setLatest(null); setFrames([]);
    fileRef.current = null; loadedUid.current = null; uploadedFile.current = null; restoredUid.current = null;
  }, [uid]);
  useEffect(() => { if (elf && fileRef.current && loadedUid.current === uid) {
    saveWatchDraft(documentId, uid, { elf, file: fileRef.current, selected, source: loadedSource.current, revision: loadedRevision.current });
    void rememberWatchSelection(uid, fileRef.current, selected, loadedRevision.current).catch(() => {});
  } }, [documentId, uid, elf, selected, debugArtifact]);
  const load = async (file, source = 'manual', restoredSelection = []) => {
    if (!file || running || hardware.current) return;
    const id = ++importId.current; setLoading(true); setElf(null); setSelected([]); setInputError(''); setQuery(''); setLatest(null); setFrames([]); history.current = [];
    loadedSource.current = source;
    loadedUid.current = uid;
    loadedRevision.current = firmwareHistory(uid).at(-1)?.id || null;
    fileRef.current = file;
    try {
      if (!/\.elf$/i.test(file.name) || file.size > 16 * 1024 * 1024) throw new Error('Debug bilgili .ELF seç; en fazla 16 MB. BIN değişken adlarını taşımaz.');
      if (!window.__TAURI_INTERNALS__) throw new Error('ELF çözümleme masaüstü uygulamasında kullanılabilir.');
      const info = await inspectWatchFile(file, invoke);
      if (!alive.current || id !== importId.current) return;
      setElf(info); setFileName(file.name); setChoice(info.variables[0] ? variableId(info.variables[0]) : '');
      setSelected(info.variables.map(variableId).filter(id => restoredSelection.includes(id)).slice(0, 16));
      void rememberWatchElf(uid, file).catch(error => setNotice(`ELF bu oturumda tutuluyor; diske kaydedilemedi: ${error?.message || error}`));
      setState({ status: 'idle', message: `${info.variables.length} RAM değişkeni bulundu. İzleme başlatıldığında flash eşleşmesi kontrol edilir.` });
    } catch (error) { if (alive.current && id === importId.current) setState({ status: 'error', message: error.message || String(error) }); }
    finally { if (alive.current && id === importId.current) setLoading(false); }
  };
  useEffect(() => {
    if (!active || !uid || elf || loading || debugArtifact?.file || running || hardwareBusy || restoredUid.current === uid) return;
    restoredUid.current = uid;
    let cancelled = false;
    void recalledWatchSession(uid).then(stored => { if (!cancelled && alive.current && stored?.file) void load(stored.file, 'saved', stored.selected || []); }).catch(() => {});
    return () => { cancelled = true; restoredUid.current = null; };
  }, [uid, active, hardwareBusy, debugArtifact?.file]);
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
    if (starting.current || running) return;
    starting.current = true;
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
          onProgress: next => { if (alive.current && !isStopped()) transition(next); },
          onLoaded: (id, file) => { uploadedFile.current = file; loadedSource.current = 'upload'; services.onFirmwareLoaded?.(id, file, { status: 'loaded', imageSha256: elf.imageSha256 }); loadedRevision.current = firmwareHistory(id).at(-1)?.id || null; },
        }),
        read: (token, vars) => espJson(activeBridge, '/api/watch/read', { method: 'POST', body: { uid, session: token, addresses: vars.map(v => `${v.address}:${v.size}`).join(',') }, timeoutMs: 40000 }),
        onState: next => { if (alive.current) transition(next); if (next.status === 'error') setNotice(`İzleme başarısız: ${next.message}`); },
        onFrame: frame => { if (!alive.current) return; setLatest(frame); setNow(Date.now()); setFrames(current => [...current.slice(-239), frame]); if (history.current.length < limit.current) history.current.push(frame); },
      });
      controller.current = session; await session.start();
    } catch (error) { if (alive.current) transition({ status: 'error', message: error.message || String(error) }); }
    finally { starting.current = false; }
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
  const fresh = state.status === 'live' && watchFreshness(latest, now, Number(interval)).fresh;
  const preparing = ['verifying', 'programming', 'reading', 'retrying', 'stopping'].includes(state.status);
  const step = ['reading', 'retrying'].includes(state.status) ? 1 : 0;
  const closeDrawer = () => { setDrawer(false); setTelemetryOpen(false); };
  const locked = loading || ['verifying', 'programming', 'retrying', 'stopping'].includes(state.status) || Boolean(hardwareBusy && !running);
  const source = <div className="watch-source">
    <label className="watch-elf-control">
      {elf && <span className="watch-elf-file" title={fileName}>{fileName}</span>}
      <span className="watch-elf-action"><FileUp size={14}/>{loading ? 'Okunuyor…' : elf ? 'Değiştir' : 'ELF seç'}</span>
      <input aria-label="İzleme ELF dosyası" type="file" accept=".elf" disabled={running || loading || Boolean(hardwareBusy)} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }}/>
    </label>
    {debugArtifact?.file && loadedSource.current === 'manual' && <button className="secondary" disabled={running || loading || Boolean(hardwareBusy)} onClick={() => { uploadedFile.current = debugArtifact.file; void load(debugArtifact.file, 'upload'); }}>HIZLI YÜKLEME ELF’İ</button>}
  </div>;
  return <div className="live-monitor global-watch compact-watch">
    <header className="live-heading">
      <h1>Live Expressions</h1>
      <div className="watch-header-tools">
        <button className="secondary watch-settings" aria-label="İzleme ayarları" onClick={() => setDrawer(true)}><Settings size={18}/></button>
      </div>
    </header>
    <div className="watch-context">
      <div className="watch-target" role="group" aria-label="Çalışılan kart" title={uid ? 'Hedef UID: ' + uid : 'STM32 bağlı değil'}>
        <div><small>ÇALIŞILAN KART</small><strong>{target?.label || target?.model || 'STM32 bağlı değil'}</strong></div>
        <span className="watch-target-model">{target?.label && target?.model ? target.model : ''}{uid && <code>#{uid.slice(-6)}</code>}</span>
        <WatchSignal state={state} latest={latest} interval={Number(interval)} connected={target?.connected && uid === target.uid}/>
      </div>
      {source}
    </div>
    {elf && <div className="watch-entry">
      <form className="watch-expression" onSubmit={submitExpression}>
        <input aria-label="Global değişken ara" placeholder="Değişken adı · Enter ile izle" autoComplete="off" spellCheck={false} value={query} disabled={locked} onChange={e => { setQuery(e.target.value); setInputError(''); }}/>
        <button className="secondary" type="submit" disabled={!query.trim() || selected.length >= 16 || locked} aria-label="Değişkeni ekle ve izle"><Plus size={16}/></button>
      </form>
      <fieldset className="watch-add watch-picker" disabled={locked}>
        <SelectMenu ariaLabel="İzlenecek global değişken" searchable value={chosen ? variableId(chosen) : ''}
          options={filtered.map(v => ({ value: variableId(v), searchText: v.name + ' ' + v.typeName + ' 0x' + v.address.toString(16),
            label: <span className="watch-symbol"><strong>{v.name}</strong><small>{v.typeName}</small><code>{'0x' + v.address.toString(16)}</code></span> }))} onChange={setChoice}/>
        <button className="secondary" disabled={!chosen || selected.length >= 16} onClick={() => void addVariable(chosen)} aria-label="ELF değişkenini ekle"><Plus size={15}/> EKLE</button>
      </fieldset>
      {inputError && <p role="alert" className="watch-input-error">{inputError}</p>}
    </div>}
    <div className="live-toolbar">
      <button className={running ? 'secondary' : 'primary'} title={!selected.length ? 'Önce değişken adını Enter ile veya ELF listesinden EKLE ile ekle.' : ''}
        disabled={state.status === 'stopping' || !running && (!elf || !selected.length || !active || esp.status !== 'online' || !uid || Boolean(hardwareBusy))}
        onClick={running ? () => stop() : () => start()}>{running ? <Pause size={15}/> : <Play size={15}/>} {state.status === 'stopping' ? 'DURDURULUYOR…' : running ? 'DURDUR' : 'İZLEMEYİ BAŞLAT'}</button>
      <button className="secondary" disabled={!history.current.length || exporting} onClick={exportCsv}><Download size={15}/> CSV</button>
      {variables.length > 0 && <span>{variables.length} değişken izleniyor</span>}
    </div>
    {preparing && <section className="watch-preflight" aria-label="İzleme hazırlığı">
      {state.status !== 'stopping' && <ol>{['ELF eşleşmesi', 'İlk RAM okuması', 'Canlı'].map((name, index) => <li key={name} className={index === step ? 'current' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined}><i>{index < step ? '✓' : index + 1}</i>{name}</li>)}</ol>}
      <div><p role="status">{state.message}</p><time>{Math.max(0, Math.floor((now - (state.since || now)) / 1000))} sn</time></div>
      {state.status === 'programming' && <progress aria-label="ELF yükleme ilerlemesi" max="100" value={state.progress}/>}
    </section>}
    {state.status === 'error' && <p role="status" className="live-message is-error">{state.message}</p>}
    {!esp.programmer?.watchAvailable && <p className="live-update-note">Bu özellik için güncel ESP firmware’i gerekir.</p>}
    <section className="watch-results" aria-label="İzlenen değişkenler">
      <div className="live-channels">{variables.map(variable => {
        const v = latest?.values.find(v => v.id === variableId(variable));
        return <article className={'live-channel ' + (fresh && v?.valid ? 'channel-live' : 'channel-inactive')} key={variableId(variable)}>
          <div className="live-channel-heading">
            <div><h2>{variable.name}</h2><small>{variable.typeName} · {'0x' + variable.address.toString(16)} · {variable.size} bayt</small></div>
            <div className="live-value"><strong>{valueText(v)}</strong><small>{fresh && v?.valid ? 'CANLI' : v && !v.valid ? 'TUTARSIZ / GEÇERSİZ OKUMA' : 'SON OKUMA'}</small></div>
            <button className="watch-remove" aria-label={variable.name + ' izlemeyi kaldır'} disabled={['verifying', 'programming', 'stopping'].includes(state.status)} onClick={() => removeVariable(variableId(variable))}><X size={15}/></button>
          </div>
          <WatchGraph frames={frames} id={variableId(variable)}/>
        </article>;
      })}{!variables.length && <div className="live-empty"><Activity size={24}/><h2>Değişken adını yaz</h2><p>Enter ile izle · en fazla 16 değişken</p></div>}</div>
    </section>
    {drawer && <Popup variant="drawer" className="detail-drawer watch-drawer" ariaLabel="İzleme ayarları" onClose={closeDrawer}>
      <div className="drawer-title"><h2>İzleme ayarları</h2><button className="icon-link" aria-label="Kapat" onClick={closeDrawer}><X size={18}/></button></div>
      <div className="drawer-body">
      <div className="watch-timing"><h3>Kayıt bilgisi</h3><p>{history.current.length} örnek saklandı · sınır {limit.current} örnek</p><p>Aynı anda en fazla 16 değişken izlenir. CSV bu oturumdaki saklanan örnekleri içerir.</p></div>
      <div className="watch-timing"><h3>Okuma hızı</h3><p>Hedef aralık; gerçek hız ağ ve SWD’ye bağlıdır.</p>
        <fieldset className="live-rate" disabled={running}><SelectMenu ariaLabel="Değişken okuma aralığı" value={interval}
          options={[{ value: '225', label: '225 ms · hızlı' }, { value: '250', label: '250 ms · varsayılan' }, { value: '500', label: '500 ms' }, { value: '1000', label: '1 saniye' }]} onChange={setIntervalMs}/></fieldset>
      </div>
      <p>İzleme çekirdeği durdurmaz. Başlamış flash yazımı durdurma isteğinde güvenli tamamlanır. Büyük ELF’lerde eşleşme kontrolü daha uzun sürebilir.</p>
      {state.status === 'programming' && Number.isFinite(state.progress) && <p>Yükleme: %{Math.round(state.progress)}</p>}
      {telemetryPanel && <details className="watch-legacy" onToggle={event => { setTelemetryOpen(event.currentTarget.open); if (event.currentTarget.open) stop(); }}>
        <summary>Telemetri ABI araçları</summary>{telemetryPanel(telemetryOpen)}
      </details>}
      </div>
    </Popup>}
  </div>;
}
