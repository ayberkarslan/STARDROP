import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Cpu, FileUp, RefreshCw, Settings, X } from 'lucide-react';
import { normalizeEspAddress } from './lib/espConnection.js';
import { espJson, espStream } from './lib/espTransport.js';
import Popup from './Popup.jsx';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const speedOptions = [
  { value: 'auto', title: 'AUTO', detail: 'Önerilen · gerektiğinde yavaşlar' },
  { value: 'turbo', title: 'TURBO', detail: 'En hızlı · sağlam kısa hat' },
  { value: 'fast', title: 'FAST', detail: 'Dengeli hız' },
  { value: 'safe', title: 'SAFE', detail: 'Uzun kablo ve zayıf temas' },
];

export default function EspConsole({ bridge, setBridge, espBase, devices, onConnect, onDiscover, target, notice, refreshTarget, firmware, setFirmware, flashFirmware, flashLog, flashProgress, flashBusy, setNotice, hardware, hardwareBusy, documentId }) {
  const deviceBusy = flashBusy || Boolean(hardwareBusy);
  const [drawer, setDrawer] = useState(null);
  const [settingsTab, setSettingsTab] = useState('programmer');
  const terminalRef = useRef(null);
  const [programmer, setProgrammer] = useState(null);
  const [wifi, setWifi] = useState(null);
  const [networks, setNetworks] = useState([]);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [usage, setUsage] = useState(null);
  const [usageProgress, setUsageProgress] = useState(null);
  const [usageRemaining, setUsageRemaining] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = espBase;

  const loadSettings = async () => {
    if (!base) return;
    try { if (normalizeEspAddress(bridge) !== base) return; } catch (_) { return; }
    try {
      const [p, w] = await Promise.all([espJson(base, '/api/programmer/status'), espJson(base, '/api/wifi/status')]);
      setProgrammer(p);
      setWifi(w);
    } catch (error) { setNotice(`ESP ayarları okunamadı: ${error.message}`); }
  };

  useEffect(() => { if (drawer === 'settings' && base) loadSettings(); }, [drawer, base]);
  useEffect(() => { setLabel(target?.label || ''); setUsage(null); setUsageError(''); }, [target?.uid]);
  useEffect(() => { if (flashBusy) { setUsage(null); setUsageError(''); } }, [flashBusy]);
  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [flashLog]);

  const action = async (path, payload, success) => {
    setBusy(true);
    try {
      if ((path === '/api/target/label' && (!payload.label.trim() || /["\\]/.test(payload.label))) ||
          (path === '/api/wifi/add' && /["\\]/.test(payload.ssid))) {
        throw new Error('Ad tırnak veya ters eğik çizgi içeremez.');
      }
      await hardware.run(documentId, 'ESP ayarları', async () => {
        await espJson(base, path, { method: 'POST', body: payload });
        if (path !== '/api/wifi/switch') await loadSettings();
      });
      setNotice(success);
      if (path === '/api/target/label') await refreshTarget();
      if (path === '/api/wifi/add') setPassword('');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const scanWifi = async () => {
    setBusy(true);
    try { await hardware.run(documentId, 'Ağ taraması', async () => setNetworks((await espJson(base, '/api/wifi/scan')).filter((item) => item.ssid))); }
    catch (error) { setNotice(`Ağ taraması başarısız: ${error.message}`); }
    finally { setBusy(false); }
  };

  const readUsage = () => {
    let lease;
    try { lease = hardware.acquire(documentId, 'Flash analizi'); }
    catch (error) { setNotice(error.message); return; }
    setUsage(null); setUsageError(''); setUsageProgress(0); setUsageRemaining(null);
    const startedAt = performance.now();
    espStream(base, '/stream-target-flash-usage', (event) => {
      if (Number.isFinite(event.pct)) {
        setUsageProgress(event.pct);
        if (event.pct > 2 && event.pct < 100) {
          const elapsed = (performance.now() - startedAt) / 1000;
          setUsageRemaining(Math.max(0, Math.round(elapsed * (100 - event.pct) / event.pct)));
        }
      }
    }, 120000).then(setUsage).catch((error) => {
      setUsageError(`Flash analizi başarısız: ${error.message}`);
      setNotice(`Flash okunamadı: ${error.message}`);
    }).finally(() => { setUsageProgress(null); setUsageRemaining(null); hardware.release(lease); });
  };

  const usagePercent = usage?.totalBytes > 0
    ? Math.max(0, Math.min(100, usage.programmedBytes * 100 / usage.totalBytes)) : 0;
  const renderTargetBody = () => <div className="drawer-body">
    <div className="target-drawer-name"><Cpu size={18}/><strong>{target?.label || target?.model}</strong><small>{target?.model}</small></div>
    <div className="target-flash-card">
      <div className="flash-visual">
        <svg className="flash-ring" viewBox="0 0 104 104" role="img" aria-label={`Flash doluluğu ${usage ? usagePercent.toFixed(1) + '%' : 'henüz ölçülmedi'}`}>
          <circle className="flash-ring-bg" cx="52" cy="52" r="42"/>
          <circle className="flash-ring-value" cx="52" cy="52" r="42" strokeDasharray="263.9" strokeDashoffset={263.9 * (1 - usagePercent / 100)}/>
        </svg>
        <div className="flash-summary">
          <strong>{usage ? `${usagePercent.toFixed(1)}%` : '—'}</strong>
          <span>{usageProgress !== null ? 'Flash SWD üzerinden okunuyor...'
            : usageError || (usage ? `${kb(usage.programmedBytes)} programlanmış · ${kb(usage.freeBytes)} boş · ${(usage.durationMs / 1000).toFixed(1)} sn` : 'Flash analizi yapılmadı.')}</span>
          <button className="flash-analyze" disabled={usageProgress !== null || deviceBusy} onClick={readUsage}>{usageProgress !== null ? 'ANALİZ EDİLİYOR...' : "FLASH'I ANALİZ ET"}</button>
        </div>
      </div>
      {usageProgress !== null && <div className="target-analysis-progress"><div className="flash-feedback-top"><span>{usageRemaining === null ? 'SWD FLASH OKUNUYOR...' : `FLASH TARANIYOR · ~${usageRemaining} SN KALDI`}</span><strong>{usageProgress}%</strong></div><div className="progress"><i style={{ width: `${usageProgress}%` }}/></div></div>}
      <p className="flash-analysis-note">Analiz tüm flash’ı SWD üzerinden yalnızca okur. “Programlanmış” bayt, değeri FF olmayan fiziksel flash baytıdır.</p>
    </div>
    <div className="detail-row"><span>UID</span><code>{target?.uid || '—'}</code></div>
    <div className="detail-row"><span>Device / revision</span><code>{target?.deviceId || '—'} / {target?.revisionId || '—'}</code></div>
    <div className="detail-row"><span>DP IDCODE</span><code>{target?.dpIdcode || '—'}</code></div>
    <div className="detail-row"><span>Flash</span><strong>{target?.flashSizeKb || '—'} KB</strong></div>
    <div className="drawer-section"><label>Kart adı</label><div className="inline-form"><input value={label} maxLength={32} onChange={(event) => setLabel(event.target.value)} placeholder="Örn. Telemetri kartı"/><button disabled={busy || !label.trim()} onClick={() => action('/api/target/label', { label: label.trim() }, 'Kart adı kaydedildi.')}>Kaydet</button></div><small>Ad, bu STM32’nin UID’siyle eşleştirilir.</small></div>
  </div>;

  const chooseFile = (file) => {
    if (!file) return;
    if (!/\.(bin|elf)$/i.test(file.name)) { setNotice('Yalnızca .bin veya .elf dosyası seçebilirsin.'); return; }
    setFirmware(file);
  };

  const renderSettingsBody = () => <div className="drawer-body">
    <div className="drawer-tabs"><button className={settingsTab === 'programmer' ? 'active' : ''} onClick={() => setSettingsTab('programmer')}>Programlayıcı</button><button className={settingsTab === 'network' ? 'active' : ''} onClick={() => setSettingsTab('network')}>Ağ</button></div>
    {settingsTab === 'programmer' ? <>
      <section className="settings-group"><div className="settings-group-heading"><strong>ESP32 bağlantısı</strong><small>Otomatik keşif çalışmazsa adresi buradan gir.</small></div><div className="inline-form"><input aria-label="ESP32 adresi" value={bridge} onChange={(event) => setBridge(event.target.value)} placeholder="http://192.168.4.1"/><button onClick={() => onConnect(bridge)}>Bağlan</button></div></section>
      <section className="settings-group"><div className="settings-group-heading"><strong>SWD hızı</strong><small>AUTO kararsız bağlantıda hızı düşürür. Yazılan veri her profilde doğrulanır.</small></div><div className="speed-options" role="group" aria-label="SWD hız profili">{speedOptions.map((option) => <button key={option.value} type="button" aria-pressed={(programmer?.speedMode || 'auto') === option.value} className={(programmer?.speedMode || 'auto') === option.value ? 'selected' : ''} disabled={busy || !programmer} onClick={() => action('/api/programmer/settings', { speedMode: option.value }, `SWD hızı ${option.title} olarak kaydedildi.`)}><span className="speed-radio"/><span><strong>{option.title}</strong><small>{option.detail}</small></span></button>)}</div></section>
      <section className="settings-group"><div className="settings-group-heading"><strong>Programlayıcı durumu</strong><small>Bağlantı ve son yükleme bilgileri.</small></div><div className="detail-row"><span>SWCLK / SWDIO</span><code>GPIO {programmer?.swclkPin ?? '—'} / {programmer?.swdioPin ?? '—'}</code></div><div className="detail-row"><span>Son işlem</span><strong>{programmer?.lastResult || '—'}</strong></div><div className="detail-row"><span>Profil / süre</span><strong>{programmer?.lastProfile || '—'} · {programmer?.lastDurationMs ?? '—'} ms</strong></div>{programmer?.lastDiagnostics && <small className="diagnostic-line">{programmer.lastDiagnostics}</small>}</section>
    </> : <>
      <section className="settings-group"><div className="settings-group-heading"><strong>Aktif bağlantı</strong><small>ESP32 hem yerel ağa hem yedek erişim noktasına açık kalır.</small></div><div className="detail-row"><span>Ağ</span><strong>{wifi?.connected ? wifi.ssid : 'AP modu'}</strong></div><div className="detail-row"><span>IP</span><code>{wifi?.ip || '—'}</code></div><div className="detail-row"><span>Yedek AP</span><code>{wifi?.apSsid || '—'} · {wifi?.apIp || '—'}</code></div>{wifi?.connected && <div className="detail-row"><span>Sinyal</span><strong>{wifi.rssi} dBm</strong></div>}</section>
      <section className="settings-group"><div className="settings-group-heading"><strong>Kayıtlı ağlar</strong><small>Bağlanınca ESP’nin IP adresi değişebilir.</small></div>{wifi?.saved?.length ? wifi.saved.map((name) => <div className="network-row" key={name}><span>{name}{wifi.ssid === name && wifi.connected ? ' · aktif' : ''}</span><div><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/switch', { ssid: name }, `${name} ağına geçiliyor; IP değişebilir.`)}>Bağlan</button><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/remove', { ssid: name }, `${name} kaldırıldı.`)}>Sil</button></div></div>) : <small>Henüz kayıtlı ağ yok.</small>}<button className="settings-text-button" onClick={scanWifi} disabled={busy}>Çevredeki ağları tara</button>{networks.length > 0 && <div className="network-scan">{networks.map((item) => <button key={item.ssid} onClick={() => setSsid(item.ssid)}>{item.ssid}<small>{item.rssi} dBm</small></button>)}</div>}</section>
      <section className="settings-group"><div className="settings-group-heading"><strong>Yeni ağ ekle</strong><small>Ağı kaydettikten sonra yukarıdaki listeden bağlan.</small></div><input aria-label="Wi-Fi adı" value={ssid} onChange={(event) => setSsid(event.target.value)} placeholder="Wi-Fi adı (SSID)"/><input aria-label="Wi-Fi şifresi" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Wi-Fi şifresi"/><button className="drawer-primary" disabled={busy || !ssid.trim()} onClick={() => action('/api/wifi/add', { ssid: ssid.trim(), pass: password }, 'Ağ kaydedildi. Bağlanmak için yukarıdan seç.')}>Ağı kaydet</button></section>
    </>}
  </div>;

  return <main className="flash-workspace">
    <div className="flash-heading"><div><h1>STARDROP</h1><p>Yıldız Roket Takımı • Aviyonik OTA</p></div><button className="icon-link" onClick={() => setDrawer('settings')} title="ESP32 ayarları"><Settings size={17} /><span>Ayarlar</span></button></div>

    <div className={`target-line ${target?.connected ? 'connected' : ''}`}><button className="target-open" onClick={() => setDrawer('target')} disabled={!target?.connected || deviceBusy} title={target?.connected ? 'Kart ayrıntıları ve flash analizi' : undefined}><span className="target-indicator"/><span className="target-label"><strong>{target?.connected ? target.label || target.model : target?.dpConnected ? 'SWD bağlı · STM32 okunamıyor' : 'STM32 hedefi bekleniyor'}</strong><small>{target?.connected ? target.model : notice}</small></span>{target?.connected && <ChevronRight className="target-chevron" size={15}/>}</button><button className="icon-link refresh" onClick={refreshTarget} disabled={deviceBusy} aria-label="Hedefi yenile" title="Hedefi yenile"><RefreshCw size={15}/></button></div>
    {target?.connected && /başarısız|hata|erişilemedi|okunamadı|zaman aşımı|geçersiz/i.test(notice) && <p className="flash-error" role="alert">{notice}</p>}

    <label className="firmware-select" onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()}><FileUp size={23}/><strong>Firmware dosyası seç</strong><small>.ELF VEYA .BIN SÜRÜKLE</small><input type="file" accept=".bin,.elf" onChange={(event) => chooseFile(event.target.files?.[0])}/></label>
    {firmware && <div className="firmware-file-card"><div><strong title={firmware.name}>{firmware.name}</strong><span>{firmware.name.toLowerCase().endsWith('.elf') ? 'ELF → BIN' : 'RAW BIN'}</span></div><small>{kb(firmware.size)}</small></div>}

    <button className="flash-submit" disabled={!firmware || !target?.connected || deviceBusy} onClick={() => flashFirmware()}>{flashBusy ? 'YÜKLENİYOR…' : hardwareBusy ? 'DONANIM İŞLEMİ BEKLENİYOR…' : 'YAZILIMI YÜKLE (SWD)'}</button>
    {(flashBusy || flashLog.length > 0) && <div className="flash-feedback"><div className="flash-feedback-top"><span>{flashBusy ? 'İŞLEM SÜRÜYOR' : flashProgress === 100 ? 'DOĞRULANDI' : 'SON İŞLEM'}</span><strong>{flashProgress}%</strong></div><div className="progress"><i style={{ width: `${flashProgress}%` }}/></div></div>}
    {!flashBusy && !flashLog.length && <p className="flash-footnote">Yükleme mevcut firmware’i siler; yazılan veriler geri okunarak doğrulanır.</p>}
    <div className="flash-terminal" ref={terminalRef} role="log" aria-label="SWD işlem terminali" aria-live="off">
      {flashLog.length ? flashLog.map((entry, index) => <p key={index} className={`log-${['info', 'success', 'warn', 'error', 'chunk'].includes(entry.type) ? entry.type : 'info'}`}>[{entry.time}] {entry.msg}</p>)
        : <p className="log-info">[STARDROP] YRT Aviyonik SWD İstasyonu Hazır. Yazılım bekleniyor...</p>}
    </div>

    {drawer && <Popup variant="drawer" className="detail-drawer" ariaLabel={drawer === 'target' ? 'Kart bilgileri' : 'ESP32 ayarları'} onClose={() => setDrawer(null)}><div className="drawer-title"><div><span className="eyebrow">{drawer === 'target' ? 'SWD HEDEFİ' : 'ESP32'}</span><h2>{drawer === 'target' ? 'Kart bilgileri' : 'Ayarlar'}</h2></div><button className="icon-link" onClick={() => setDrawer(null)} aria-label="Kapat"><X size={18}/></button></div>
      {drawer === 'settings' && <div className="discovered-list"><div className="discovered-list-head"><span>BULUNAN ESP32</span><button onClick={onDiscover} disabled={deviceBusy}>Yeniden tara</button></div>{devices.map((device) => <button key={`${device.mac}-${device.replyAddress}`} onClick={() => onConnect(device.replyAddress)} disabled={deviceBusy}>{device.name || 'STARDROP'} · {device.replyAddress}<small>{device.rssi ? `${device.rssi} dBm` : 'AP'}</small></button>)}</div>}
      {drawer === 'target' ? renderTargetBody()
      : renderSettingsBody()}
      <div className="drawer-notice" role="status">{notice}</div>
    </Popup>}
  </main>;
}
