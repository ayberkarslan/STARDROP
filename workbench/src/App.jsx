import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Download, FileUp, FlaskConical, Radio, RefreshCw, Save, Send, ShieldCheck, Upload } from 'lucide-react';
import { addAuditEvent, overallConfidence, validateBoardProfile } from './lib/boardProfile.js';
import { profileFromNetlist } from './lib/netlistProfile.js';
import { exportStardropProject, importStardropProject } from './lib/projectArchive.js';

const savedBridge = localStorage.getItem('stardrop.bridge') || 'http://192.168.4.1';

function Badge({ children, tone = 'muted' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function Section({ title, children, action }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

export default function App() {
  const [mode, setMode] = useState('flash');
  const [bridge, setBridge] = useState(savedBridge);
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('ESP32 programlayıcı bekleniyor.');
  const [firmware, setFirmware] = useState(null);
  const [flashLog, setFlashLog] = useState([]);
  const [flashProgress, setFlashProgress] = useState(0);
  const [profile, setProfile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [sources, setSources] = useState({ netlist: null, schematic: null, bom: null });
  const [activeComponent, setActiveComponent] = useState(null);
  const fileRef = useRef(null);
  const projectRef = useRef(null);

  const profileValidation = useMemo(() => profile ? validateBoardProfile(profile) : null, [profile]);

  const normalizedBridge = bridge.replace(/\/$/, '');
  const refreshTarget = async () => {
    localStorage.setItem('stardrop.bridge', normalizedBridge);
    setNotice('SWD hedefi sorgulanıyor…');
    try {
      const result = await fetch(`${normalizedBridge}/api/target/status`, { signal: AbortSignal.timeout(6000) });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      const nextTarget = await result.json();
      setTarget(nextTarget);
      setNotice(nextTarget.connected ? `${nextTarget.label || nextTarget.model} hazır.` : `Hedef bulunamadı (ACK ${nextTarget.ack ?? '-'})`);
    } catch (error) {
      setTarget(null);
      setNotice(`ESP32’ye erişilemedi: ${error.message}`);
    }
  };

  useEffect(() => { refreshTarget(); }, []);

  const flashFirmware = async (selected = firmware) => {
    if (!selected) return setNotice('Önce bir .bin veya .elf seç.');
    setFlashLog([]); setFlashProgress(0);
    try {
      const form = new FormData(); form.append('firmware', selected, selected.name);
      const upload = await fetch(`${normalizedBridge}/upload`, { method: 'POST', body: form });
      if (!upload.ok) throw new Error('Firmware ESP32 belleğine alınamadı.');
      setFlashLog((logs) => [...logs, `[YÜKLENDİ] ${selected.name} (${selected.size} B)`]);
      const stream = new EventSource(`${normalizedBridge}/stream-flash`);
      stream.onmessage = ({ data }) => {
        const event = JSON.parse(data);
        if (event.msg) setFlashLog((logs) => [...logs.slice(-80), event.msg]);
        if (Number.isFinite(event.pct)) setFlashProgress(event.pct);
        if (event.done || event.error) { stream.close(); refreshTarget(); }
      };
      stream.onerror = () => stream.close();
    } catch (error) { setNotice(`Flash başlatılamadı: ${error.message}`); }
  };

  const loadNetlist = async (file) => {
    if (!file) return;
    try {
      const netlist = await file.text();
      const result = profileFromNetlist(netlist, { netlistName: file.name });
      setProfile(result.profile); setAnalysis(result.analysis);
      setSources((current) => ({ ...current, netlist })); setActiveComponent(result.profile.components[0]?.ref || null);
      setMode('workbench'); setNotice(`${result.profile.components.length} cihaz adayı bulundu; pinleri onayla.`);
    } catch (error) { setNotice(`NET okunamadı: ${error.message}`); }
  };

  const editConnection = (index, field, value) => setProfile((current) => {
    const connections = current.connections.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value, source: field === 'mcuPin' || field === 'peripheral' ? 'USER' : item.source } : item);
    return addAuditEvent({ ...current, connections }, 'PIN_OVERRIDE', { index, field, value });
  });

  const approveComponent = (componentRef) => setProfile((current) => {
    const connections = current.connections.map((item) => item.componentRef === componentRef ? { ...item, approved: true } : item);
    return addAuditEvent({ ...current, connections }, 'CONNECTIONS_APPROVED', { componentRef });
  });

  const exportProject = async () => {
    try {
      const file = await exportStardropProject({ profile, netlist: sources.netlist, bom: sources.bom, schematicPdf: sources.schematic });
      const url = URL.createObjectURL(file); const link = document.createElement('a');
      link.href = url; link.download = `${profile.name}.stardrop`; link.click(); URL.revokeObjectURL(url);
      setNotice('Taşınabilir .stardrop paketi indirildi.');
    } catch (error) { setNotice(error.message); }
  };

  const importProject = async (file) => {
    try {
      const data = await importStardropProject(file); setProfile(data.profile);
      setSources({ netlist: data.sources['sources/board.NET'] ? await data.sources['sources/board.NET'].text() : null, schematic: data.sources['sources/schematic.pdf'] || null, bom: data.sources['sources/bom.csv'] ? await data.sources['sources/bom.csv'].text() : null });
      setActiveComponent(data.profile.components[0]?.ref || null); setMode('workbench'); setNotice('STARDROP projesi güvenle geri yüklendi.');
    } catch (error) { setNotice(`Proje açılamadı: ${error.message}`); }
  };

  const components = profile?.components || [];
  const componentConnections = profile?.connections.filter((item) => item.componentRef === activeComponent) || [];

  return <div className="app-shell">
    <aside className="rail">
      <div className="brand"><div className="brand-mark">✦</div><div><strong>STARDROP</strong><small>AVIONICS WORKBENCH</small></div></div>
      <nav>
        <button className={mode === 'flash' ? 'active' : ''} onClick={() => setMode('flash')}><Upload />Hızlı Yükleme</button>
        <button className={mode === 'workbench' ? 'active' : ''} onClick={() => setMode('workbench')}><FlaskConical />Kart Workbench</button>
      </nav>
      <div className="rail-status"><span className="status-dot" /><span>{notice}</span></div>
    </aside>
    <main>
      <header><div><h1>{mode === 'flash' ? 'HIZLI YÜKLEME' : 'KART WORKBENCH'}</h1><p>SWD · F401/F446 · doğrulanabilir donanım profilleri</p></div><div className="bridge"><Radio /><input value={bridge} onChange={(event) => setBridge(event.target.value)} aria-label="ESP32 adresi"/><button onClick={refreshTarget} title="Hedefi yenile"><RefreshCw /></button></div></header>
      {mode === 'flash' ? <div className="workspace two-col">
        <Section title="SWD HEDEFİ" action={<button className="icon-button" onClick={refreshTarget}><RefreshCw /></button>}>
          {target?.connected ? <div className="target-card"><Cpu /><div><strong>{target.label || target.model}</strong><p>{target.model} · {target.flashSizeKb} KB · UID {target.uid}</p></div><Badge tone="good">BAĞLI</Badge></div> : <div className="empty">ESP32 ve SWD hattını kontrol et. Bu modda GitHub veya parser gerekmez.</div>}
        </Section>
        <Section title="FIRMWARE" action={<Badge>{firmware ? 'HAZIR' : 'DOSYA BEKLENİYOR'}</Badge>}>
          <label className="dropzone"><FileUp /><strong>{firmware?.name || '.BIN / .ELF SEÇ'}</strong><small>{firmware ? `${firmware.size.toLocaleString()} bayt` : 'Mevcut üretim firmware’ini doğrudan yükle.'}</small><input type="file" accept=".bin,.elf,application/octet-stream" onChange={(event) => setFirmware(event.target.files?.[0] || null)} /></label>
          <button className="primary" disabled={!firmware} onClick={() => flashFirmware()}><Send />ESP32 ÜZERİNDEN FLASHLA</button>
        </Section>
        <Section title="CANLI İŞLEM" action={<Badge tone={flashProgress === 100 ? 'good' : 'muted'}>{flashProgress}%</Badge>}>
          <div className="progress"><i style={{ width: `${flashProgress}%` }} /></div><pre className="log">{flashLog.length ? flashLog.join('\n') : 'İşlem günlüğü burada görünecek.'}</pre>
        </Section>
      </div> : <div className="workspace workbench">
        {!profile ? <Section title="KART DOSYASI"><div className="import-grid"><label className="dropzone"><FileUp /><strong>ALTIUM .NET İÇE AKTAR</strong><small>Elektriksel bağlantı analizi yerelde yapılır.</small><input ref={fileRef} type="file" accept=".net,.NET,.txt" onChange={(event) => loadNetlist(event.target.files?.[0])} /></label><label className="dropzone"><Download /><strong>.STARDROP AÇ</strong><small>Kaynaklar, profil ve test geçmişi tek dosyada.</small><input ref={projectRef} type="file" accept=".stardrop" onChange={(event) => importProject(event.target.files?.[0])} /></label></div></Section> : <>
          <div className="summary-row"><Section title="KART PROFİLİ"><strong className="profile-name">{profile.name}</strong><p>{profile.mcu.part} · {components.length} cihaz adayı</p></Section><Section title="DETERMİNİSTİK GÜVEN"><div className="confidence"><strong>{overallConfidence(profile)}%</strong><span>{profileValidation.valid ? 'DERLEMEYE UYGUN' : 'DÜZELTME GEREKİYOR'}</span></div></Section><Section title="PROJE"><button className="secondary" onClick={exportProject}><Save />.STARDROP EXPORT</button></Section></div>
          <div className="work-grid"><Section title="BİLEŞENLER" action={<Badge>{components.length}</Badge>}><div className="component-list">{components.map((component) => <button key={component.ref} onClick={() => setActiveComponent(component.ref)} className={activeComponent === component.ref ? 'selected' : ''}><span><strong>{component.ref}</strong><small>{component.part}</small></span><Badge tone={profile.connections.filter((entry) => entry.componentRef === component.ref).every((entry) => entry.approved) ? 'good' : 'warn'}>{component.protocol || '?'}</Badge></button>)}</div></Section>
            <Section title={activeComponent ? `${activeComponent} PIN MATRİSİ` : 'PIN MATRİSİ'} action={activeComponent && <button className="secondary" onClick={() => approveComponent(activeComponent)}><ShieldCheck />ONAYLA</button>}>
              <div className="pin-table">{componentConnections.map((connection) => { const index = profile.connections.indexOf(connection); return <div className="pin-row" key={`${connection.componentRef}-${connection.role}-${index}`}><div><strong>{connection.role}</strong><small>{connection.sensorPin || '?'}</small></div><input value={connection.mcuPin || ''} onChange={(event) => editConnection(index, 'mcuPin', event.target.value.toUpperCase())}/><input value={connection.peripheral || ''} onChange={(event) => editConnection(index, 'peripheral', event.target.value.toUpperCase())}/><Badge tone={connection.approved ? 'good' : connection.confidence >= 60 ? 'warn' : 'bad'}>{connection.approved ? 'ONAYLI' : `${connection.confidence}%`}</Badge></div>; })}</div>
              {!!profileValidation.errors.length && <div className="validation bad"><strong>Derleme engelleri</strong>{profileValidation.errors.map((error) => <span key={error}>{error}</span>)}</div>}
              {!!profileValidation.warnings.length && <div className="validation warn"><strong>İnceleme notları</strong>{profileValidation.warnings.slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)}</div>}
            </Section></div>
          <Section title="TEST KATALOĞU"><div className="catalog"><button><Activity /><strong>BMP180</strong><small>Kimlik + basınç örneği</small></button><button><Activity /><strong>MS5611</strong><small>Kimlik + basınç örneği</small></button><button><Activity /><strong>GENERIC I²C</strong><small>Bus tarama/doğrulama</small></button></div><p className="catalog-note">GitHub girişli katalog, bulut derleme ve SRAM üzerinden canlı sonuç ekranı bir sonraki dilimde bağlanacak. Hızlı Yükleme bu akıştan bağımsız kalır.</p></Section>
        </>}
      </div>}
    </main>
  </div>;
}
