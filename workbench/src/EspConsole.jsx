import { useEffect, useState } from 'react';
import { Cpu, FileUp, RefreshCw, Settings, X } from 'lucide-react';

async function requestJson(base, path, options) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000), ...options });
  const data = await response.json();
  if (!response.ok || data.status === 'error') throw new Error(data.message || data.msg || `HTTP ${response.status}`);
  return data;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export default function EspConsole({ bridge, setBridge, target, notice, refreshTarget, firmware, setFirmware, flashFirmware, flashLog, flashProgress, flashBusy, setNotice }) {
  const [drawer, setDrawer] = useState(null);
  const [settingsTab, setSettingsTab] = useState('programmer');
  const [showLog, setShowLog] = useState(false);
  const [programmer, setProgrammer] = useState(null);
  const [wifi, setWifi] = useState(null);
  const [networks, setNetworks] = useState([]);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [usage, setUsage] = useState(null);
  const [usageProgress, setUsageProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = bridge.trim().replace(/\/$/, '');

  const loadSettings = async () => {
    try {
      const [p, w] = await Promise.all([requestJson(base, '/api/programmer/status'), requestJson(base, '/api/wifi/status')]);
      setProgrammer(p);
      setWifi(w);
    } catch (error) { setNotice(`ESP ayarları okunamadı: ${error.message}`); }
  };

  useEffect(() => { if (drawer === 'settings') loadSettings(); }, [drawer]);
  useEffect(() => { setLabel(target?.label || ''); setUsage(null); }, [target?.uid]);

  const action = async (path, payload, success) => {
    setBusy(true);
    try {
      if ((path === '/api/target/label' && (!payload.label.trim() || /["\\]/.test(payload.label))) ||
          (path === '/api/wifi/add' && /["\\]/.test(payload.ssid))) {
        throw new Error('Ad tırnak veya ters eğik çizgi içeremez.');
      }
      await requestJson(base, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setNotice(success);
      if (path !== '/api/wifi/switch') await loadSettings();
      if (path === '/api/target/label') await refreshTarget();
      if (path === '/api/wifi/add') setPassword('');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const scanWifi = async () => {
    setBusy(true);
    try { setNetworks((await requestJson(base, '/api/wifi/scan')).filter((item) => item.ssid)); }
    catch (error) { setNotice(`Ağ taraması başarısız: ${error.message}`); }
    finally { setBusy(false); }
  };

  const readUsage = () => {
    setUsage(null); setUsageProgress(0);
    const stream = new EventSource(`${base}/stream-target-flash-usage`);
    const timeout = window.setTimeout(() => { stream.close(); setUsageProgress(null); setNotice('Flash analizi zaman aşımına uğradı.'); }, 120000);
    const finish = () => { window.clearTimeout(timeout); stream.close(); setUsageProgress(null); };
    stream.onmessage = ({ data }) => {
      try {
        const event = JSON.parse(data);
        if (Number.isFinite(event.pct)) setUsageProgress(event.pct);
        if (event.done) { setUsage(event); finish(); }
        if (event.error) { setNotice('Flash okunamadı; SWD hattını kontrol et.'); finish(); }
      } catch (_) { /* Bozuk SSE mesajını atla. */ }
    };
    stream.onerror = () => { setNotice('Flash okuma akışı kesildi.'); finish(); };
  };

  const chooseFile = (file) => {
    if (!file) return;
    if (!/\.(bin|elf)$/i.test(file.name)) { setNotice('Yalnızca .bin veya .elf dosyası seçebilirsin.'); return; }
    setFirmware(file);
    setShowLog(false);
  };

  return <main className="flash-workspace">
    <div className="flash-heading"><div><span className="eyebrow">SWD PROGRAMLAYICI</span><h1>Firmware yükle</h1></div><button className="icon-link" onClick={() => setDrawer('settings')} title="ESP32 ayarları"><Settings size={17} /><span>Ayarlar</span></button></div>

    <div className={`target-line ${target?.connected ? 'connected' : ''}`}><span className="target-indicator"/><button className="target-open" onClick={() => setDrawer('target')} disabled={!target?.connected}><strong>{target?.connected ? target.label || target.model : 'STM32 hedefi bekleniyor'}</strong><small>{target?.connected ? target.model : notice}</small></button><button className="icon-link refresh" onClick={refreshTarget} aria-label="Hedefi yenile" title="Hedefi yenile"><RefreshCw size={15}/></button></div>
    {target?.connected && /başarısız|hata|erişilemedi|okunamadı|zaman aşımı|geçersiz/i.test(notice) && <p className="flash-error" role="alert">{notice}</p>}

    <label className="firmware-select" onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()}><FileUp size={23}/><strong>{firmware?.name || 'Firmware dosyası seç'}</strong><small>{firmware ? `${kb(firmware.size)} · ${firmware.name.toLowerCase().endsWith('.elf') ? 'ELF → BIN' : 'BIN'}` : '.BIN veya .ELF sürükle ya da tıkla'}</small><input type="file" accept=".bin,.elf" onChange={(event) => chooseFile(event.target.files?.[0])}/></label>

    <button className="flash-submit" disabled={!firmware || !target?.connected || flashBusy} onClick={() => flashFirmware()}>{flashBusy ? 'YÜKLENİYOR…' : 'YAZILIMI YÜKLE (SWD)'}</button>
    {(flashBusy || flashLog.length > 0) && <div className="flash-feedback"><div className="flash-feedback-top"><span>{flashBusy ? 'İŞLEM SÜRÜYOR' : flashProgress === 100 ? 'DOĞRULANDI' : 'SON İŞLEM'}</span><strong>{flashProgress}%</strong></div><div className="progress"><i style={{ width: `${flashProgress}%` }}/></div><button className="log-toggle" onClick={() => setShowLog(!showLog)}>{showLog ? 'Ayrıntıları gizle' : 'İşlem ayrıntıları'} <span>{showLog ? '−' : '+'}</span></button>{showLog && <pre className="flash-log">{flashLog.join('\n')}</pre>}</div>}
    {!flashBusy && !flashLog.length && <p className="flash-footnote">Yükleme mevcut firmware’i siler; yazılan veriler geri okunarak doğrulanır.</p>}

    {drawer && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="detail-drawer"><div className="drawer-title"><div><span className="eyebrow">{drawer === 'target' ? 'SWD HEDEFİ' : 'ESP32'}</span><h2>{drawer === 'target' ? 'Kart bilgileri' : 'Ayarlar'}</h2></div><button className="icon-link" onClick={() => setDrawer(null)} aria-label="Kapat"><X size={18}/></button></div>
      {drawer === 'target' ? <div className="drawer-body"><div className="target-drawer-name"><Cpu size={18}/><strong>{target?.label || target?.model}</strong><small>{target?.model}</small></div><div className="detail-row"><span>UID</span><code>{target?.uid || '—'}</code></div><div className="detail-row"><span>Device / revision</span><code>{target?.deviceId || '—'} / {target?.revisionId || '—'}</code></div><div className="detail-row"><span>DP IDCODE</span><code>{target?.dpIdcode || '—'}</code></div><div className="detail-row"><span>Flash</span><strong>{target?.flashSizeKb || '—'} KB</strong></div><div className="drawer-section"><label>Kart adı</label><div className="inline-form"><input value={label} maxLength={32} onChange={(event) => setLabel(event.target.value)} placeholder="Örn. Telemetri kartı"/><button disabled={busy || !label.trim()} onClick={() => action('/api/target/label', { label: label.trim() }, 'Kart adı kaydedildi.')}>Kaydet</button></div><small>Ad, bu STM32’nin UID’siyle eşleştirilir.</small></div><div className="drawer-section"><div className="section-line"><strong>Flash kullanımı</strong><button disabled={usageProgress !== null} onClick={readUsage}>{usageProgress !== null ? `${usageProgress}%` : 'Analiz et'}</button></div>{usageProgress !== null && <div className="progress"><i style={{ width: `${usageProgress}%` }}/></div>}{usage && <><div className="usage-track"><i style={{ width: `${Math.round(usage.programmedBytes * 100 / usage.totalBytes)}%` }}/></div><div className="detail-row"><span>Programlı / boş</span><strong>{kb(usage.programmedBytes)} / {kb(usage.freeBytes)}</strong></div></>}<small>Programlı alan, 0xFF olmayan bayt sayısıdır.</small></div></div>
      : <div className="drawer-body"><div className="drawer-tabs"><button className={settingsTab === 'programmer' ? 'active' : ''} onClick={() => setSettingsTab('programmer')}>Programlayıcı</button><button className={settingsTab === 'network' ? 'active' : ''} onClick={() => setSettingsTab('network')}>Ağ</button></div>{settingsTab === 'programmer' ? <><div className="drawer-section"><label>ESP32 adresi</label><div className="inline-form"><input value={bridge} onChange={(event) => setBridge(event.target.value)} placeholder="http://192.168.4.1"/><button onClick={() => { refreshTarget(); loadSettings(); }}>Bağlan</button></div></div><div className="drawer-section"><label>SWD hız profili</label><select value={programmer?.speedMode || 'auto'} onChange={(event) => action('/api/programmer/settings', { speedMode: event.target.value }, 'SWD hızı kaydedildi.')} disabled={busy || !programmer}><option value="auto">AUTO</option><option value="turbo">TURBO</option><option value="fast">FAST</option><option value="safe">SAFE</option></select><small>AUTO bağlantı kararsızsa hızı düşürür. Doğrulama her zaman açıktır.</small></div><div className="detail-row"><span>SWCLK / SWDIO</span><code>GPIO {programmer?.swclkPin ?? '—'} / {programmer?.swdioPin ?? '—'}</code></div><div className="detail-row"><span>Son işlem</span><strong>{programmer?.lastResult || '—'}</strong></div><div className="detail-row"><span>Profil / süre</span><strong>{programmer?.lastProfile || '—'} · {programmer?.lastDurationMs ?? '—'} ms</strong></div>{programmer?.lastDiagnostics && <small className="diagnostic-line">{programmer.lastDiagnostics}</small>}</> : <><div className="detail-row"><span>Aktif ağ</span><strong>{wifi?.connected ? wifi.ssid : 'AP modu'}</strong></div><div className="detail-row"><span>IP</span><code>{wifi?.ip || '—'}</code></div><div className="detail-row"><span>Yedek AP</span><code>{wifi?.apSsid || '—'} · {wifi?.apIp || '—'}</code></div>{wifi?.connected && <div className="detail-row"><span>Sinyal</span><strong>{wifi.rssi} dBm · %{wifi.pct}</strong></div>}<div className="drawer-section"><div className="section-line"><strong>Kayıtlı ağlar</strong><button onClick={scanWifi} disabled={busy}>Çevreyi tara</button></div>{wifi?.saved?.map((name) => <div className="network-row" key={name}><span>{name}{wifi.ssid === name && wifi.connected ? ' · aktif' : ''}</span><div><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/switch', { ssid: name }, `${name} ağına geçiliyor; IP değişebilir.`)}>Bağlan</button><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/remove', { ssid: name }, `${name} kaldırıldı.`)}>Sil</button></div></div>)}{networks.length > 0 && <div className="network-scan">{networks.map((item) => <button key={item.ssid} onClick={() => setSsid(item.ssid)}>{item.ssid}<small>{item.rssi} dBm</small></button>)}</div>}</div><div className="drawer-section"><label>Yeni ağ ekle</label><input value={ssid} onChange={(event) => setSsid(event.target.value)} placeholder="Wi-Fi adı (SSID)"/><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre"/><button className="drawer-primary" disabled={busy || !ssid.trim()} onClick={() => action('/api/wifi/add', { ssid: ssid.trim(), pass: password }, 'Ağ kaydedildi. Bağlanmak için yukarıdan seç.')}>Ağı kaydet</button></div></>}</div>}
      <div className="drawer-notice" role="status">{notice}</div>
    </aside></div>}
  </main>;
}
