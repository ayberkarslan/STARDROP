import { useEffect, useRef, useState } from 'react';
import { Activity, Download, Pause, Play, Circle, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import SelectMenu from './SelectMenu.jsx';
import GlobalWatch from './GlobalWatch.jsx';
import { espJson } from './lib/espTransport.js';
import { createTelemetrySession, telemetryCsv } from './lib/telemetry.js';
import { DEFAULT_SETTINGS, measurement } from './lib/settings.js';

const labels = { temperature: 'Sıcaklık', pressure: 'Basınç' };
const stateLabels = { idle: 'Hazır', connecting: 'Bağlanıyor', live: 'Canlı', paused: 'Durduruldu', stale: 'Veri durmuş',
  retrying: 'Bağlantı kontrolü', error: 'İzleme durdu', 'sensor-error': 'Sensör hatası' };
const number = value => Number.isFinite(value) ? value.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—';
const hex = value => value === undefined ? '—' : '0x' + value.toString(16).padStart(8, '0');

function Trace({ samples, channel }) {
  const [cursor, setCursor] = useState(null);
  const points = samples.map(sample => ({ x: sample.receivedAt,
    y: sample.sensorStatus === 1 && sample.channels.find(item => item.name === channel.name)?.valid
      ? sample.channels.find(item => item.name === channel.name).value : null }));
  const values = points.filter(p => p.y !== null).map(p => p.y);
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 1;
  const margin = Math.max((max - min) * 0.12, Math.abs(max) * 0.0001, 0.001);
  const low = min - margin, high = max + margin;
  const first = points[0]?.x || 0, last = Math.max(first + 1, points.at(-1)?.x || 1);
  const x = value => 66 + (value - first) / (last - first) * 548;
  const y = value => 130 - (value - low) / (high - low) * 110;
  let pen = false;
  const path = points.map(point => {
    if (point.y === null) { pen = false; return ''; }
    const part = `${pen ? 'L' : 'M'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`; pen = true; return part;
  }).join(' ');
  const inspected = cursor === null ? null : points[Math.min(points.length - 1, Math.round(cursor * (points.length - 1)))];
  return <div className="live-trace">
    <svg viewBox="0 0 640 160" role="img" aria-label={`${labels[channel.name] || channel.name} zaman grafiği`}
      onPointerLeave={() => setCursor(null)} onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setCursor(Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * 640 - 66) / 548)));
      }}>
      {[0, 0.5, 1].map(t => <g key={t}><line x1="66" x2="614" y1={20 + 110 * t} y2={20 + 110 * t}/><text x="58" y={24 + 110 * t} textAnchor="end">{number(high - (high - low) * t)}</text></g>)}
      <path className="live-trace-line" d={path}/>
      <text x="66" y="153">{points.length ? new Date(first).toLocaleTimeString('tr-TR') : 'Ölçüm bekleniyor'}</text>
      <text x="614" y="153" textAnchor="end">{points.length ? new Date(last).toLocaleTimeString('tr-TR') : ''}</text>
      {inspected && inspected.y !== null && <g><line className="live-crosshair" x1={x(inspected.x)} x2={x(inspected.x)} y1="18" y2="132"/><circle cx={x(inspected.x)} cy={y(inspected.y)} r="3"/></g>}
    </svg>
    <div className="live-trace-stats">{inspected ? <span>{new Date(inspected.x).toLocaleTimeString('tr-TR')} · {number(inspected.y)} {channel.unit}</span>
      : <><span>Min {number(values.length ? min : null)}</span><span>Ort {number(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)}</span><span>Max {number(values.length ? max : null)}</span></>}</div>
  </div>;
}

export default function LiveMonitor({ documentId, initialData, active, services }) {
  const [mode, setMode] = useState(initialData?.mode || (initialData?.expected ? 'telemetry' : services.debugArtifact?.file ? 'variables' : 'telemetry'));
  const { esp, target, activeBridge, hardware, hardwareBusy, setNotice } = services;
  const preferences = services.preferences || DEFAULT_SETTINGS;
  const recordLimit = useRef(preferences.recordLimit);
  const [state, setState] = useState({ status: 'idle', message: 'Telemetri destekli STM32 yazılımını yükle, ardından izlemeyi başlat.' });
  const [latest, setLatest] = useState(null);
  const [samples, setSamples] = useState([]);
  const [logs, setLogs] = useState([]);
  const [interval, setIntervalMs] = useState(String(preferences.intervalMs));
  const [recording, setRecording] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(Date.now);
  const controller = useRef(null), records = useRef([]), recordOn = useRef(false), lastFrame = useRef(null);
  const mounted = useRef(true), lastMessage = useRef('');
  const expectedUid = initialData?.uid || target?.uid;
  const running = ['connecting', 'live', 'stale', 'retrying', 'sensor-error'].includes(state.status);
  const offeredElf = useRef(null);
  useEffect(() => {
    const file = services.debugArtifact?.file;
    if (file && file !== offeredElf.current && active && !running && !initialData?.expected) {
      offeredElf.current = file; setMode('variables');
    }
  }, [services.debugArtifact?.file, active, running, initialData?.expected]);
  useEffect(() => { if (!running) setIntervalMs(String(preferences.intervalMs)); }, [preferences.intervalMs]);
  const sampleAge = latest ? (latest.ageMs ?? 0) + Math.max(0, now - latest.receivedAt) : null;
  const status = state.status === 'live' && sampleAge > Math.max(2000, Number(interval) * 3) ? 'stale' : state.status;
  const addLog = message => {
    if (message === lastMessage.current) return;
    lastMessage.current = message;
    setLogs(current => [...current.slice(-79), { at: new Date().toLocaleTimeString('tr-TR'), message }]);
  };
  const stop = message => controller.current?.stop(message || 'İzleme durduruldu.');
  useEffect(() => {
    if (!active || mode !== 'telemetry' || esp.status !== 'online') stop(!active || mode !== 'telemetry' ? 'İzleme ekranı değişti; SWD okuması durduruldu.' : 'ESP32 bağlantısı kesildi.');
  }, [active, mode, esp.status]);
  useEffect(() => () => controller.current?.stop('ESP32 adresi veya sekme değişti; izleme durduruldu.'), [activeBridge]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.stop(); }; }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running]);
  const start = () => {
    try {
      if (!activeBridge || esp.status !== 'online') throw new Error('Önce ESP32’ye bağlan.');
      if (target?.uid && initialData?.uid && target.uid.toUpperCase() !== initialData.uid.toUpperCase()) throw new Error('Bu test başka STM32 için hazırlandı. Doğru kartı bağla.');
      lastFrame.current = null; setLatest(null); setSamples([]);
      recordLimit.current = preferences.recordLimit;
      controller.current = createTelemetrySession({ hardware, ownerId: documentId, uid: expectedUid,
        expected: initialData?.expected, expectedModel: initialData?.model || target?.model, intervalMs: Number(interval),
        fetchSample: () => espJson(activeBridge, '/api/telemetry', { timeoutMs: 3000 }),
        onState: next => { if (!mounted.current) return; setState(next); addLog(next.message); },
        onFrame: frame => {
          if (!mounted.current) return;
          const changed = !lastFrame.current || frame.sensorStatus !== lastFrame.current.sensorStatus;
          lastFrame.current = frame; setLatest(frame);
          if (frame.newSample || changed) {
            setSamples(current => [...current.slice(-239), frame]);
            if (recordOn.current) {
              if (records.current.length >= recordLimit.current) {
                recordOn.current = false; setRecording(false); addLog(`Kayıt ${recordLimit.current} örnek sınırına ulaştı; kayıt durdu. CSV’yi dışa aktar.`);
              } else { records.current.push(frame); setRecordCount(records.current.length); }
            }
          }
        },
      });
      controller.current.start();
    } catch (error) { setState({ status: 'error', message: error.message }); addLog(error.message); }
  };
  const exportCsv = async () => {
    if (!records.current.length) return;
    setExporting(true);
    try {
      const csv = telemetryCsv(records.current);
      if (window.__TAURI_INTERNALS__) {
        const path = await invoke('telemetry_export_csv', { csv, directory: preferences.exportDirectory || null }); setNotice(`Ölçüm kaydı kaydedildi: ${path}`); addLog(`CSV: ${path}`);
      } else {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'stardrop-telemetry.csv'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); addLog('CSV indirildi.');
      }
    } catch (error) { setNotice(`CSV kaydedilemedi: ${error.message}`); addLog(error.message); }
    finally { if (mounted.current) setExporting(false); }
  };
  const modes = <div className="live-mode-switch" aria-label="Canlı izleme türü"><button className={mode === 'telemetry' ? 'active' : ''} onClick={() => setMode('telemetry')}>Sensör verileri</button><button className={mode === 'variables' ? 'active' : ''} onClick={() => { stop(); setMode('variables'); }}>Değişkenler</button></div>;
  if (mode === 'variables') return <>{modes}<GlobalWatch documentId={documentId} initialData={initialData} active={active} services={services}/></>;
  return <>{modes}<div className="live-monitor">
    <header className="live-heading"><div><span className="eyebrow">SWD / SALT OKUNUR</span><h1>Canlı İzleme</h1><p>{initialData?.label || target?.label || latest?.model || target?.model || 'STM32'}{initialData?.testName && ` · ${initialData.testName}`}</p></div>
      <span className={`live-status status-${status}`}><i/>{stateLabels[status]}</span></header>
    <div className="live-toolbar">
      <button className={running ? 'secondary' : 'primary'} onClick={running ? () => stop() : start}
        disabled={!running && (esp.status !== 'online' || !expectedUid || Boolean(hardwareBusy))}>{running ? <Pause size={16}/> : <Play size={16}/>} {running ? 'DURDUR' : 'İZLEMEYİ BAŞLAT'}</button>
      <fieldset className="live-rate" disabled={running} title={running ? 'Okuma aralığını değiştirmek için izlemeyi durdur.' : 'Okuma aralığı'}><SelectMenu ariaLabel="Okuma aralığı" value={interval} options={[{ value: '250', label: '250 ms' }, { value: '500', label: '500 ms' }, { value: '1000', label: '1 saniye' }]}
        onChange={value => { if (!running) setIntervalMs(value); }}/></fieldset>
      <button className={`secondary ${recording ? 'is-recording' : ''}`} onClick={() => { recordOn.current = !recordOn.current; setRecording(recordOn.current); addLog(recordOn.current ? 'Ölçüm kaydı başladı.' : 'Ölçüm kaydı durduruldu.'); }}><Circle size={13}/>{recording ? 'KAYDI DURDUR' : 'KAYDET'}</button>
      <button className="secondary" disabled={!recordCount || exporting} onClick={exportCsv}><Download size={15}/>{exporting ? 'KAYDEDİLİYOR…' : 'CSV'}</button>
      <button className="live-clear" aria-label="Ölçüm kaydını temizle" disabled={recording || !recordCount} onClick={() => { records.current = []; setRecordCount(0); }}><Trash2 size={15}/></button>
      <span className="live-record-count">{recordCount} kayıt</span>
    </div>
    <p className={`live-message ${status === 'error' || status === 'sensor-error' ? 'is-error' : ''}`} role="status">{status === 'stale' ? 'Yeni örnek bekleniyor; ekrandaki değerler son ölçümdür.' : state.message}</p>
    {!esp.programmer?.telemetryAvailable && <p className="live-update-note">Eski ESP yazılımında bu özellik yok. ESP32-S3 firmware’ini güncelledikten sonra kullanabilirsin.</p>}
    <div className="live-facts"><div><small>HEDEF UID</small><span title={expectedUid}>{expectedUid || 'Bağlı STM32 yok'}</span></div><div><small>ÖRNEK</small><span>{latest?.sampleCounter ?? '—'}</span></div><div><small>MCU ZAMANI</small><span>{latest ? `${(latest.timestampMs / 1000).toFixed(2)} s` : '—'}</span></div><div><small>ATLANAN ÖRNEK</small><span>{latest?.skipped ?? '—'}</span></div></div>
    <div className="live-channels">{latest?.channels.map(raw => measurement(raw, preferences)).map(channel => <article className={`live-channel ${status === 'live' && channel.valid ? 'channel-live' : 'channel-inactive'}`} key={channel.name}>
      <div className="live-channel-heading"><div><h2>{labels[channel.name] || channel.name}</h2><small>{channel.name}</small></div><Activity size={16}/></div>
      <div className="live-value"><strong>{channel.valid && latest.sensorStatus === 1 ? number(channel.value) : '—'}</strong><span>{channel.unit === 'degC' ? '°C' : channel.unit}</span>
        <small>{status === 'live' && channel.valid ? 'CANLI' : !channel.valid || latest.sensorStatus === 2 ? 'GEÇERSİZ ÖRNEK' : 'SON ÖLÇÜM'}</small></div>
      <Trace samples={samples.map(sample => ({ ...sample, channels: sample.channels.map(c => measurement(c, preferences)) }))} channel={channel}/>
    </article>)}{!latest?.channels.length && <div className="live-empty"><Activity size={28}/><h2>Ölçüm bekleniyor</h2><p>Kanallar firmware’den otomatik okunur.<br/>UART veya ek sensör kablosu gerekmez.</p></div>}</div>
    <details className="live-details"><summary>Oturum ve veri bütünlüğü</summary><div className="live-integrity"><span>ABI {latest?.abi || '—'} · CRC ESP32’de doğrulanır</span><span>Test {hex(latest?.testIdHash)}</span><span>Profil {hex(latest?.profileHash)}</span><span>Çalıştırma {hex(latest?.runHash)}</span><span>RAM 0x20000200 · 400 bayt</span><span>SWD okuma {latest?.readMs ?? '—'} ms</span><span>Son örnek {latest?.ageMs === null || !latest ? '—' : `${latest.ageMs} ms önce`}</span><span>Grafik: son 240 okunan örnek · CSV: en fazla 2000 örnek</span></div></details>
    <div className="live-log" role="log" aria-label="Canlı izleme günlüğü"><h2>Olay günlüğü</h2>{logs.length ? logs.map((entry, index) => <p key={index}><time>{entry.at}</time><span>{entry.message}</span></p>) : <p>İzleme başlatılmadı.</p>}</div>
    <p className="live-footnote">Bu ekran canlı ölçüm izler; breakpoint koymaz, çekirdeği durdurmaz veya reset atmaz. Atlanan örnekler, okuma aralığı nedeniyle yakalanamayan MCU örnekleridir.</p>
  </div></>;
}
