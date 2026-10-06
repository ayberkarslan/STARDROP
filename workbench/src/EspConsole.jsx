import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Cpu, FileUp, RefreshCw, Settings, X } from 'lucide-react';
import { normalizeEspAddress } from './lib/espConnection.js';
import { espJson, espStream } from './lib/espTransport.js';
import Popup from './Popup.jsx';
import espModuleImage from './assets/esp32-s3.png';
import stmModuleImage from './assets/stm32.png';
import WiringGuide from './WiringGuide.jsx';
import FlashProgress from './FlashProgress.jsx';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const speedOptions = [
  { value: 'auto', title: 'AUTO', detail: 'Önerilen · gerektiğinde yavaşlar' },
  { value: 'turbo', title: 'TURBO', detail: 'En hızlı · sağlam kısa hat' },
  { value: 'fast', title: 'FAST', detail: 'Dengeli hız' },
  { value: 'safe', title: 'SAFE', detail: 'Uzun kablo ve zayıf temas' },
];

export default function EspConsole({ devicesOnly = false, esp, bridge, setBridge, espBase, devices, onConnect, onDiscover, target, notice, refreshTarget, saveTargetName, firmware, setFirmware, flashFirmware, flashLog, flashProgress, flashBusy, flashStage, flashError, flashStartedAt, setNotice, hardware, hardwareBusy, documentId }) {
  const deviceBusy = flashBusy || Boolean(hardwareBusy);
  const [drawer, setDrawer] = useState(null);
  const [wiringOpen, setWiringOpen] = useState(false);
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
  const [maintenance, setMaintenance] = useState(null);
  const [eraseConfirmed, setEraseConfirmed] = useState(false);
  const [maintenanceUid, setMaintenanceUid] = useState(null);
  const [maintenanceProgress, setMaintenanceProgress] = useState(null);
  const [maintenanceError, setMaintenanceError] = useState('');
  const [maintenanceSeconds, setMaintenanceSeconds] = useState(0);
  const maintenanceClock = useRef({ started: 0, updated: 0 });
  const base = espBase;
  useEffect(() => {
    if (!busy || !maintenance) return;
    const timer = setInterval(() => setMaintenanceSeconds(Math.floor((Date.now() - maintenanceClock.current.started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy, maintenance]);
  const openMaintenance = operation => {
    setMaintenance(operation); setMaintenanceUid(target?.uid); setEraseConfirmed(false);
    setMaintenanceProgress(null); setMaintenanceError(''); setMaintenanceSeconds(0);
  };

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
  useEffect(() => { if (devicesOnly && base) loadSettings(); }, [devicesOnly, base]);
  useEffect(() => {
    if (esp?.programmer) setProgrammer(esp.programmer);
    if (esp?.wifi) setWifi(esp.wifi);
  }, [esp?.programmer, esp?.wifi]);
  useEffect(() => { setLabel(target?.label || ''); setUsage(null); setUsageError(''); }, [target?.uid, target?.label, base]);
  useEffect(() => { if (flashBusy) { setUsage(null); setUsageError(''); } }, [flashBusy]);
  useEffect(() => { if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight; }, [flashLog]);

  const action = async (path, payload, success) => {
    setBusy(true);
    try {
      if (path === '/api/target/label' && saveTargetName) {
        await saveTargetName(target, payload.label);
        setNotice('Kart adı bu bilgisayarda UID ile kaydedildi.');
        return;
      }
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
  const runMaintenance = async () => {
    const operation = maintenance;
    const uid = maintenanceUid;
    if (operation === 'erase' && !eraseConfirmed) return;
    maintenanceClock.current = { started: Date.now(), updated: Date.now() };
    setMaintenanceSeconds(0); setMaintenanceError('');
    setMaintenanceProgress({ stage: 'connecting', pct: 0, overallPct: 0 });
    setBusy(true);
    try {
      await hardware.run(documentId, 'STM32 bakım', async () => {
        if (operation === 'esp-reset') {
          await espJson(base, '/api/programmer/restart', { method: 'POST', body: { confirmation: 'ESP RESET' } });
          return;
        }
        const live = await espJson(base, '/api/target/status');
        if (!live.connected || live.uid !== uid) throw new Error('Hedef değişti; işlem yapılmadı.');
        if (operation === 'erase') {
          if (!programmer?.maintenanceStreamAvailable) throw new Error('Canlı silme ilerlemesi için ESP32 yazılımını güncelle. Silme başlatılmadı.');
          await espStream(base, '/stream-target-maintenance', event => {
            maintenanceClock.current.updated = Date.now();
            setMaintenanceProgress(previous => ({ ...previous, ...event }));
            if (event.done && Number.isFinite(event.elapsedMs)) setMaintenanceSeconds(Math.floor(event.elapsedMs / 1000));
          }, 190000, { method: 'POST', body: { operation, uid, confirmation: 'FLASH SIL' } });
        } else {
          await espJson(base, '/api/target/maintenance', { method: 'POST', timeoutMs: 120000, body: { operation, uid } });
        }
      });
      setUsage(null);
      if (operation !== 'erase') setMaintenance(null);
      setNotice(operation === 'erase' ? 'Flash silindi ve boş olduğu doğrulandı. Yeni kod yükle.' : operation === 'esp-reset' ? 'ESP32 yeniden başlatılıyor; ağ bağlantısının dönmesini bekle.' : 'STM32 yeniden başlatıldı.');
      if (operation !== 'esp-reset') await refreshTarget().catch(error => setNotice(`Bakım tamamlandı; hedef bilgisi yenilenemedi: ${error.message}`));
    } catch (error) {
      setMaintenanceError(`${error.message} Tamamlandı onayı alınmadıysa flash durumu kesin değildir; bağlantıyı kontrol etmeden yeniden silme başlatma.`);
      setNotice(`Bakım başarısız: ${error.message}`);
    }
    finally { setBusy(false); }
  };
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
    <div className="drawer-section"><label>Kart adı</label><div className="inline-form"><input aria-label="Kart adı" value={label} maxLength={32} onChange={(event) => setLabel(event.target.value)} placeholder="Örn. Telemetri kartı"/><button disabled={busy || deviceBusy || !target?.connected || !label.trim()} onClick={() => action('/api/target/label', { label: label.trim() }, 'Kart adı kaydedildi.')}>Kaydet</button></div><small>UID ile bu bilgisayarda saklanır.</small></div>
  </div>;

  const chooseFile = (file) => {
    if (deviceBusy) { setNotice('İşlem bitmeden firmware dosyası değiştirilemez.'); return; }
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

  if (devicesOnly) return <div className="workspace devices-workspace">
    <div className="device-page-heading"><h2>Cihazlar</h2><button className="secondary" disabled={deviceBusy || busy} onClick={() => { loadSettings(); refreshTarget(); }}><RefreshCw size={15}/>Yenile</button></div>
    <div className="device-route" aria-label="Bilgisayar Wi-Fi üzerinden ESP32’ye, ESP32 SWD üzerinden STM32’ye bağlanır"><span>Bilgisayar</span><span className="device-route-line">Wi-Fi</span><span>ESP32</span><button className="device-route-line device-wiring-button" aria-label="SWD bağlantı rehberini aç" title="Nasıl bağlanır?" onClick={() => setWiringOpen(true)}>SWD <span aria-hidden="true">↗</span></button><span>STM32</span></div>
    <div className="device-columns"><section className="device-section device-programmer" aria-label="ESP32 programlayıcı">
      <div className="device-card-heading"><div><small>PROGRAMLAYICI</small><h3>ESP32</h3></div><span className={'device-connection-state' + (esp?.status === 'online' ? ' is-connected' : '')}><i/>{esp?.status === 'online' ? 'Bağlı' : 'Çevrimdışı'}</span></div>
      <div className="device-hero device-esp-hero"><img src={espModuleImage} alt="ESP32-S3 modülü"/><span>{programmer?.chipModel || 'ESP32'}<small>{base || 'Adres bekleniyor'}</small></span></div>
      <div className="device-card-content">
      <div className="detail-row"><span>Model</span><strong>{programmer?.chipModel || '—'}</strong></div>
      <div className="detail-row"><span>Flash / PSRAM</span><strong>{programmer ? `${kb(programmer.flashBytes || 0)} / ${kb(programmer.psramBytes || 0)}` : '—'}</strong></div>
      <div className="detail-row"><span>Boş heap / CPU</span><strong>{programmer ? `${kb(programmer.freeHeapBytes || 0)} / ${programmer.cpuMhz || '—'} MHz` : '—'}</strong></div>
      <div className="detail-row"><span>Ağ</span><strong>{wifi?.ssid || '—'}</strong></div>
      <div className="detail-row"><span>Sinyal</span><strong>{wifi?.rssi ?? '—'} dBm</strong></div>
      <div className="detail-row"><span>SWCLK / SWDIO</span><code>{programmer?.swclkPin ?? '—'} / {programmer?.swdioPin ?? '—'}</code></div>
      <div className="detail-row"><span>Reset bağlantısı</span><strong>{programmer ? programmer.resetAvailable ? 'Destekleniyor' : 'Yok' : '—'}</strong></div>
      <div className="detail-row"><span>Son işlem</span><strong>{programmer?.lastResult || '—'}</strong></div>
      <div className="device-action-row"><button className="secondary" onClick={() => setDrawer('settings')}>ESP ayarları</button>
      <button className="secondary" disabled={deviceBusy || busy || !programmer?.maintenanceAvailable} onClick={() => openMaintenance('esp-reset')}>ESP32 yeniden başlat</button>
      </div></div>
    </section><section className="device-section device-target" aria-label="STM32 hedef kart">
      <div className="device-card-heading"><div><small>HEDEF KART</small><h3>STM32</h3></div><span className={'device-connection-state' + (target?.connected ? ' is-connected' : '')}><i/>{target?.connected ? 'Bağlı' : 'Hedef bekleniyor'}</span></div>
      <div className="device-hero device-stm-hero"><img src={stmModuleImage} alt="STM32 mikrodenetleyici temsili görseli"/><span>{target?.label || target?.model || 'Henüz kart bağlı değil'}<small>{target?.label ? target?.model : 'SWD üzerinden hedef bağlantısı'}</small></span></div>
      <div className="device-card-content">{target?.connected ? renderTargetBody() : <div className="device-target-empty"><Cpu size={24} strokeWidth={1}/><p>Hedef bağlantısı bekleniyor</p><small>SWDIO, SWCLK ve GND bağlantılarını kontrol et.</small></div>}
      <details className="device-maintenance"><summary>Bakım ve kurtarma</summary><p>Reset RAM’i yazılımın başlangıç durumuna getirir. Flash silme tüm programı ve flash’taki verileri kaldırır; geri alınamaz. Option byte ve koruma ayarları değiştirilmez.</p>
        {!programmer?.maintenanceAvailable && <p>Bakım işlemleri için ESP firmware’ini güncelle.</p>}
        <div className="device-action-row">{[['reset', 'Yeniden başlat'], ['recover', 'Kurtarma dene'], ['erase', 'Flash’ı sil']].map(([operation, text]) => <button key={operation} className="secondary" disabled={deviceBusy || busy || !target?.connected || !programmer?.maintenanceAvailable} onClick={() => openMaintenance(operation)}>{text}</button>)}</div>
        <small>Kurtarma donanım arızasını, kopuk hattı veya RDP kilidini çözmez. NRST bağlantısı kilitli hedefte gerekebilir.</small>
      </details>
      </div>
    </section></div>
    {wiringOpen && <WiringGuide programmer={programmer} online={esp?.status === 'online'} target={target} onClose={() => setWiringOpen(false)}/>}
    {drawer && <Popup variant="drawer" className="detail-drawer" ariaLabel="ESP32 ayarları" onClose={() => setDrawer(null)}><div className="drawer-title"><h2>ESP32 ayarları</h2><button onClick={() => setDrawer(null)} aria-label="Kapat"><X size={18}/></button></div>{renderSettingsBody()}</Popup>}
    {maintenance && <Popup ariaLabel="STM32 bakım onayı" onClose={() => { if (!busy) setMaintenance(null); }}>
      <h2>{maintenanceProgress?.done ? 'Flash silindi' : maintenanceError ? 'İşlem tamamlanamadı' : busy ? 'Flash bakımı' : maintenance === 'erase' ? eraseConfirmed ? 'Emin misin?' : 'Flash silinecek' : maintenance === 'recover' ? 'Kurtarma denemesi' : maintenance === 'esp-reset' ? 'ESP32 yeniden başlatılacak' : 'STM32 yeniden başlatılacak'}</h2>
      <p>{maintenance === 'esp-reset' ? base : (target?.label || target?.model) + ' · ' + maintenanceUid}</p>
      {!maintenanceProgress && <p>{maintenance === 'erase' ? 'Program ve tüm flash verileri kalıcı olarak silinir. Geri alınamaz; sonrasında yeniden kod yüklemelisin.' : maintenance === 'esp-reset' ? 'Ağ bağlantısı geçici kesilir. Kayıtlı ayarlar ve STM32 flash’ı korunur.' : 'Çalışan test kesilir. Flash programı korunur.'}</p>}
      {maintenanceProgress && <div className="maintenance-progress" aria-live="polite">
        <strong>{maintenanceProgress.done ? 'Silme ve doğrulama tamamlandı · %100' : maintenanceProgress.stage === 'erasing' ? `Siliniyor · %${maintenanceProgress.pct}` : maintenanceProgress.stage === 'verifying' ? `Silindi · %100 — Doğrulanıyor · %${maintenanceProgress.pct}` : 'Hedef bağlantısı kontrol ediliyor…'}</strong>
        <progress max="100" value={maintenanceProgress.overallPct || 0} aria-label="Silme ve doğrulama ilerlemesi" style={{ width: '100%', accentColor: '#fff', margin: '18px 0' }}/>
        <p>{maintenanceProgress.totalBytes > 0 ? `${kb(maintenanceProgress.processedBytes || 0)} / ${kb(maintenanceProgress.totalBytes)} · ` : ''}{maintenanceSeconds} sn</p>
        {busy && Date.now() - maintenanceClock.current.updated > 5000 && <small>Son güncelleme {Math.floor((Date.now() - maintenanceClock.current.updated) / 1000)} sn önce. Yeni sektör yanıtı bekleniyor; tekrar silme başlatma.</small>}
        {maintenanceProgress.done && <p>Flash’ın boş olduğu doğrulandı. Yeni kod yükleyebilirsin.</p>}
      </div>}
      {maintenanceError && <p role="alert">{maintenanceError}</p>}
      <div className="device-action-row">
        <button className="secondary" disabled={busy} onClick={() => setMaintenance(null)}>{maintenanceProgress ? 'Kapat' : 'Vazgeç'}</button>
        {!maintenanceProgress && <button className="primary" disabled={busy || deviceBusy} onClick={() => maintenance === 'erase' && !eraseConfirmed ? setEraseConfirmed(true) : runMaintenance()}>{maintenance === 'erase' ? eraseConfirmed ? 'Evet, flash’ı sil' : 'Devam et' : 'ONAYLA'}</button>}
      </div>
    </Popup>}
  </div>;

  const blocker = deviceBusy ? 'Donanım işleminin bitmesi bekleniyor.' : esp?.status !== 'online' ? 'ESP32 bağlantısı bekleniyor.' : !target?.connected ? 'STM32 bağlantısı bekleniyor.' : !firmware ? 'Bir .bin veya .elf dosyası seç.' : '';
  return <main className="flash-workspace flash-station">
    <div className="flash-heading"><div><h1>Firmware yükle</h1><p>Dosyayı seç, hedefi kontrol et, yükle.</p></div><button className="icon-link" onClick={() => setDrawer('settings')} title="ESP32 ayarları" aria-label="ESP32 ayarları"><Settings size={17} /><span>Ayarlar</span></button></div>

    <div className={`target-line ${target?.connected ? 'connected' : ''}`}><button className="target-open" onClick={() => setDrawer('target')} disabled={!target?.connected || deviceBusy} title={target?.connected ? 'Kart ayrıntıları ve flash analizi' : undefined}><span className="target-indicator"/><span className="target-label"><strong>{target?.connected ? target.label || target.model : target?.dpConnected ? 'SWD bağlı · STM32 okunamıyor' : 'STM32 hedefi bekleniyor'}</strong><small>{target?.connected ? target.model : notice}</small></span>{target?.connected && <ChevronRight className="target-chevron" size={15}/>}</button><button className="icon-link refresh" onClick={refreshTarget} disabled={deviceBusy} aria-label="Hedefi yenile" title="Hedefi yenile"><RefreshCw size={15}/></button></div>
    {target?.connected && notice !== `Flash başarısız: ${flashError?.message}` && /başarısız|hata|erişilemedi|okunamadı|zaman aşımı|geçersiz/i.test(notice) && <p className="flash-error" role="alert">{notice}</p>}

    <div className="flash-station-grid"><section className="flash-controls" aria-label="Firmware dosyası ve yükleme">
    <label className={`firmware-select${deviceBusy ? ' is-disabled' : ''}`} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }} onDragOver={(event) => event.preventDefault()}><FileUp size={28} strokeWidth={1.3}/><strong>Firmware dosyası seç</strong><small>.BIN veya .ELF · buraya sürükle</small><input aria-label="Firmware dosyası" type="file" accept=".bin,.elf" disabled={deviceBusy} onChange={(event) => chooseFile(event.target.files?.[0])}/></label>
    {firmware && <div className="firmware-file-card"><div><strong title={firmware.name}>{firmware.name}</strong><span>{firmware.name.toLowerCase().endsWith('.elf') ? 'ELF → BIN' : 'RAW BIN'}</span></div><small>{kb(firmware.size)}</small></div>}

    <button className="flash-submit" disabled={Boolean(blocker)} title={blocker || 'Seçili firmware’i STM32’ye yükle'} onClick={() => flashFirmware()}>{flashBusy ? 'YÜKLENİYOR…' : hardwareBusy ? 'DONANIM İŞLEMİ BEKLENİYOR…' : 'YAZILIMI YÜKLE (SWD)'}</button>
    <p className="flash-blocker">{blocker || `${target?.label || target?.model} · yüklemeye hazır`}</p>
    <p className="flash-footnote">Yükleme mevcut firmware’i değiştirir. Yazılan veriler geri okunarak doğrulanır.</p>
    </section><section className="flash-runtime" aria-label="Yükleme durumu ve terminal">
    <FlashProgress stage={flashStage || (flashBusy ? 'programming' : flashLog.some(entry => entry.type === 'error') ? 'error' : flashProgress === 100 ? 'done' : 'idle')} error={flashError} progress={flashProgress} busy={flashBusy} startedAt={flashStartedAt}/>
    <div className="flash-terminal-heading"><span>İşlem terminali</span><small>{flashBusy ? 'Canlı' : flashLog.length ? 'Son işlem' : 'Beklemede'}</small></div>
    <div className="flash-terminal" ref={terminalRef} role="log" aria-label="SWD işlem terminali" aria-live="off">
      {flashLog.length ? flashLog.map((entry, index) => <p key={index} className={`log-${['info', 'success', 'warn', 'error', 'chunk'].includes(entry.type) ? entry.type : 'info'}`}>[{entry.time}] {entry.msg}</p>)
        : <p className="log-info">[STARDROP] YRT Aviyonik SWD İstasyonu Hazır. Yazılım bekleniyor...</p>}
    </div>
    </section></div>

    {drawer && <Popup variant="drawer" className="detail-drawer" ariaLabel={drawer === 'target' ? 'Kart bilgileri' : 'ESP32 ayarları'} onClose={() => setDrawer(null)}><div className="drawer-title"><div><span className="eyebrow">{drawer === 'target' ? 'SWD HEDEFİ' : 'ESP32'}</span><h2>{drawer === 'target' ? 'Kart bilgileri' : 'Ayarlar'}</h2></div><button className="icon-link" onClick={() => setDrawer(null)} aria-label="Kapat"><X size={18}/></button></div>
      {drawer === 'settings' && <div className="discovered-list"><div className="discovered-list-head"><span>BULUNAN ESP32</span><button onClick={onDiscover} disabled={deviceBusy}>Yeniden tara</button></div>{devices.map((device) => <button key={`${device.mac}-${device.replyAddress}`} onClick={() => onConnect(device.replyAddress)} disabled={deviceBusy}>{device.name || 'STARDROP'} · {device.replyAddress}<small>{device.rssi ? `${device.rssi} dBm` : 'AP'}</small></button>)}</div>}
      {drawer === 'target' ? renderTargetBody()
      : renderSettingsBody()}
      <div className="drawer-notice" role="status">{notice}</div>
    </Popup>}
  </main>;
}
