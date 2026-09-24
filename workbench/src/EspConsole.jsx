import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Cpu, FileUp, HardDrive, Radio, RefreshCw, Settings, Upload, Wifi, X } from 'lucide-react';

async function jsonRequest(base, path, options) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000), ...options });
  const data = await response.json();
  if (!response.ok || data.status === 'error') throw new Error(data.message || data.msg || `HTTP ${response.status}`);
  return data;
}

function bytesLabel(value) {
  return `${(value / 1024).toFixed(1)} KB`;
}

export default function EspConsole({ bridge, setBridge, target, notice, refreshTarget, firmware, setFirmware, flashFirmware, flashLog, flashProgress, flashBusy, setNotice }) {
  const [drawer, setDrawer] = useState(null);
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
      const [p, w] = await Promise.all([jsonRequest(base, '/api/programmer/status'), jsonRequest(base, '/api/wifi/status')]);
      setProgrammer(p); setWifi(w);
    } catch (error) { setNotice(`ESP ayarları okunamadı: ${error.message}`); }
  };
  useEffect(() => { if (drawer === 'settings') loadSettings(); }, [drawer]);
  useEffect(() => { setLabel(target?.label || ''); setUsage(null); }, [target?.uid]);

  const action = async (path, payload, success) => {
    setBusy(true);
    try {
      await jsonRequest(base, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setNotice(success);
      await loadSettings();
      if (path === '/api/target/label') await refreshTarget();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const scanWifi = async () => {
    setBusy(true);
    try {
      const list = await jsonRequest(base, '/api/wifi/scan');
      setNetworks(list.filter((item) => item.ssid));
    } catch (error) { setNotice(`Ağ taraması başarısız: ${error.message}`); }
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
        if (event.error) { setNotice('Flash okunamadı; SWD bağlantısını kontrol et.'); finish(); }
      } catch (_) { /* Bozuk SSE mesajını atla. */ }
    };
    stream.onerror = () => { setNotice('Flash okuma akışı kesildi.'); finish(); };
  };

  return <div className="programmer-page">
    <div className="programmer-topline"><div className="programmer-heading"><span className="eyebrow">PROGRAMMER / SWD</span><h2>Firmware yükle</h2><p>ESP32 üzerinden STM32’ye. İki sinyal hattı ve ortak GND.</p></div><button className="quiet-button" onClick={() => setDrawer('settings')}><Settings size={16} /> ESP ayarları</button></div>
    <div className="connection-bar"><span className={`connection-led ${target?.connected ? 'online' : ''}`} /><div><strong>{target?.connected ? 'Hedef bağlı' : 'Hedef bekleniyor'}</strong><small>{target?.connected ? `${target.label || target.model} · ${target.model}` : notice}</small></div><div className="connection-actions"><button onClick={() => setDrawer('target')} disabled={!target?.connected}>Kart bilgileri <ArrowRight size={14} /></button><button onClick={refreshTarget} aria-label="Hedefi yeniden tara" title="Yeniden tara"><RefreshCw size={16} /></button></div></div>
    <div className="programmer-grid"><div className="programmer-main"><div className="step-caption"><span>01</span><div><strong>Firmware dosyası</strong><small>STM32 için derlenmiş .bin veya .elf</small></div></div><label className="firmware-picker"><FileUp size={27} /><strong>{firmware?.name || 'Dosya seç veya buraya bırak'}</strong><small>{firmware ? `${bytesLabel(firmware.size)} · yüklemeye hazır` : '.BIN / .ELF · en fazla 1 MB'}</small><input type="file" accept=".bin,.elf" onChange={(event) => setFirmware(event.target.files?.[0] || null)} onDrop={(event) => { event.preventDefault(); setFirmware(event.dataTransfer.files?.[0] || null); }} onDragOver={(event) => event.preventDefault()} /></label><div className="flash-hint"><Cpu size={15} />{target?.connected ? `${target.model} · ${target.flashSizeKb} KB flash` : 'Hedef algılanmadan yükleme başlatılmaz.'}</div><button className="flash-cta" disabled={!firmware || !target?.connected || flashBusy} onClick={() => flashFirmware()}><Upload size={17} />{flashBusy ? 'Yükleniyor…' : 'STM32’ye yükle'}<ArrowRight size={16} /></button><p className="erase-warning">Yükleme, hedef STM32’nin mevcut firmware’ini siler. Her blok geri okunarak doğrulanır.</p></div>
    <div className="programmer-side"><div className="step-caption"><span>02</span><div><strong>İşlem durumu</strong><small>{flashBusy ? 'ESP32 çalışıyor' : flashProgress === 100 ? 'Son işlem tamamlandı' : 'Yükleme bekleniyor'}</small></div></div><div className="large-progress"><strong>{flashProgress}%</strong><span>YÜKLEME İLERLEMESİ</span><div className="progress"><i style={{ width: `${flashProgress}%` }} /></div></div><div className="console-label"><Activity size={14} /> OLAY GÜNLÜĞÜ</div><pre className="programmer-log">{flashLog.length ? flashLog.join('\n') : 'Yükleme başladığında ayrıntılar burada görünecek.'}</pre></div></div>
    {drawer && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside className="detail-drawer"><div className="drawer-title"><div><span className="eyebrow">STARDROP / {drawer === 'target' ? 'TARGET' : 'ESP32'}</span><h3>{drawer === 'target' ? 'Kart bilgileri' : 'ESP ayarları'}</h3></div><button className="quiet-button" onClick={() => setDrawer(null)} aria-label="Kapat"><X size={18} /></button></div>
      {drawer === 'target' ? <div className="drawer-body"><div className="detail-card"><Cpu size={20} /><strong>{target?.model || 'Bilinmeyen hedef'}</strong><span>SWD üzerinden algılandı</span></div><div className="detail-row"><span>Model</span><strong>{target?.model || '—'}</strong></div><div className="detail-row"><span>UID</span><code>{target?.uid || '—'}</code></div><div className="detail-row"><span>Device / Revision</span><code>{target?.deviceId || '—'} / {target?.revisionId || '—'}</code></div><div className="detail-row"><span>DP IDCODE</span><code>{target?.dpIdcode || '—'}</code></div><div className="detail-row"><span>Flash kapasitesi</span><strong>{target?.flashSizeKb || '—'} KB</strong></div><div className="drawer-section"><label>Kart adı</label><div className="inline-form"><input value={label} maxLength={32} onChange={(event) => setLabel(event.target.value)} placeholder="Örn. Telemetri kartı"/><button disabled={busy || !label.trim()} onClick={() => action('/api/target/label', { label: label.trim() }, 'Kart adı kaydedildi.')}>Kaydet</button></div><small>Ad, ESP32’de bu STM32’nin UID’sine bağlı saklanır.</small></div><div className="drawer-section"><div className="section-line"><strong>Flash kullanımı</strong><button disabled={usageProgress !== null} onClick={readUsage}>{usageProgress !== null ? `${usageProgress}% okunuyor` : 'Analiz et'}</button></div>{usage && <><div className="usage-track"><i style={{ width: `${Math.round(usage.programmedBytes * 100 / usage.totalBytes)}%` }} /></div><div className="detail-row"><span>Programlı / boş</span><strong>{bytesLabel(usage.programmedBytes)} / {bytesLabel(usage.freeBytes)}</strong></div></>}<small>Bu işlem tüm flash’ı SWD ile okur; “programlı” ölçütü 0xFF olmayan baytlardır.</small></div></div>
      : <div className="drawer-body"><div className="drawer-section"><label><Radio size={15} /> ESP32 adresi</label><div className="inline-form"><input value={bridge} onChange={(event) => setBridge(event.target.value)} placeholder="http://192.168.4.1"/><button onClick={() => { refreshTarget(); loadSettings(); }}>Bağlan</button></div><small>AP adresi genellikle 192.168.4.1. Farklı ağda ESP’nin güncel IP adresini gir.</small></div><div className="drawer-section"><label>SWD hız profili</label><select value={programmer?.speedMode || 'auto'} onChange={(event) => action('/api/programmer/settings', { speedMode: event.target.value }, 'SWD hız profili kaydedildi.')} disabled={busy || !programmer}><option value="auto">AUTO · bağlantıya göre</option><option value="turbo">TURBO · en hızlı</option><option value="fast">FAST · dengeli</option><option value="safe">SAFE · kararlı</option></select><small>Doğrulama her profilde zorunludur. AUTO, hata halinde daha yavaş profile iner.</small><div className="detail-row"><span>SWCLK / SWDIO</span><code>GPIO {programmer?.swclkPin ?? '—'} / GPIO {programmer?.swdioPin ?? '—'}</code></div><div className="detail-row"><span>Son işlem</span><strong>{programmer?.lastResult || '—'}</strong></div></div><div className="drawer-section"><div className="section-line"><strong><Wifi size={15} /> Ağ</strong><button onClick={scanWifi} disabled={busy}>Tara</button></div><div className="detail-row"><span>Aktif ağ</span><strong>{wifi?.connected ? wifi.ssid : wifi?.apSsid || '—'}</strong></div><div className="detail-row"><span>ESP IP</span><code>{wifi?.ip || '—'}</code></div>{wifi?.connected && <div className="detail-row"><span>Sinyal</span><strong>{wifi.rssi} dBm · %{wifi.pct}</strong></div>}{wifi?.saved?.map((name) => <div className="network-row" key={name}><span>{name} {wifi.ssid === name && wifi.connected ? '· aktif' : ''}</span><div><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/switch', { ssid: name }, `${name} ağına geçiş başlatıldı; IP değişebilir.`)}>Bağlan</button><button disabled={busy || wifi.ssid === name && wifi.connected} onClick={() => action('/api/wifi/remove', { ssid: name }, `${name} kaldırıldı.`)}>Sil</button></div></div>)}{networks.length > 0 && <div className="network-scan">{networks.map((item) => <button key={item.ssid} onClick={() => setSsid(item.ssid)}>{item.ssid}<small>{item.rssi} dBm</small></button>)}</div>}<div className="inline-form"><input value={ssid} onChange={(event) => setSsid(event.target.value)} placeholder="Wi-Fi adı (SSID)"/><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre"/></div><button className="drawer-primary" disabled={busy || !ssid.trim()} onClick={() => action('/api/wifi/add', { ssid: ssid.trim(), pass: password }, 'Ağ kaydedildi. Bağlanmak için kayıtlı ağdan seç.')}>Ağı kaydet</button><small>Ağ kaydetme ve ağa bağlanma ayrı işlemlerdir.</small></div></div>}
    </aside></div>}
  </div>;
}
