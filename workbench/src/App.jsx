import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Download, FileUp, FlaskConical, Github, Radio, RefreshCw, Save, Send, Settings, ShieldCheck, Upload } from 'lucide-react';
import { addAuditEvent, confidenceForConnection, createManualI2cProfile, overallConfidence, validateBoardProfile, validateTestTarget } from './lib/boardProfile.js';
import { applyAiSuggestions, requestAiReview } from './lib/aiReview.js';
import { profileFromNetlist } from './lib/netlistProfile.js';
import { exportStardropProject, importStardropProject } from './lib/projectArchive.js';
import { loadSecret, saveSecret } from './lib/secretStore.js';
import { beginGitHubDeviceLogin, catalogWritePermission, currentGitHubUser, dispatchProfileBuild, fetchCatalogDocument, pollGitHubDeviceLogin, saveCatalogDocument, waitForProfileArtifact } from './lib/githubClient.js';
import { downloadDiagnosticArtifact, hash32FromSha256, sha256Hex } from './lib/diagnosticArtifact.js';
import BoardMap from './BoardMap.jsx';
import EspConsole from './EspConsole.jsx';
import { prepareFirmware } from './lib/firmwareImage.js';
import { DEFAULT_TEST_CATALOG, buildableTargetPart, testForComponent, validateTestCatalog } from './lib/testCatalog.js';

const savedBridge = localStorage.getItem('stardrop.bridge') || 'http://192.168.4.1';

function Badge({ children, tone = 'muted' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function Section({ title, children, action }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

export default function App() {
  const [session, setSession] = useState('welcome');
  const [mode, setMode] = useState('flash');
  const [workbenchView, setWorkbenchView] = useState('overview');
  const [bridge, setBridge] = useState(savedBridge);
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('ESP32 programlayıcı bekleniyor.');
  const [firmware, setFirmware] = useState(null);
  const [flashLog, setFlashLog] = useState([]);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashBusy, setFlashBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testStage, setTestStage] = useState('');
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [testHistory, setTestHistory] = useState([]);
  const [aiConfig, setAiConfig] = useState(() => JSON.parse(localStorage.getItem('stardrop.ai.config') || '{"endpoint":"https://api.openai.com/v1","model":"gpt-4.1-mini"}'));
  const [aiKey, setAiKey] = useState('');
  const [aiReview, setAiReview] = useState(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [githubConfig, setGithubConfig] = useState(() => JSON.parse(localStorage.getItem('stardrop.github.config') || '{"clientId":"","repository":"","ref":"main"}'));
  const [githubUser, setGithubUser] = useState(null);
  const [catalog, setCatalog] = useState(DEFAULT_TEST_CATALOG);
  const [catalogSha, setCatalogSha] = useState(null);
  const [catalogAdmin, setCatalogAdmin] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [adminTestId, setAdminTestId] = useState(DEFAULT_TEST_CATALOG.tests[0]?.id || '');
  const [deviceLogin, setDeviceLogin] = useState(null);
  const [profile, setProfile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [sources, setSources] = useState({ netlist: null, schematic: null, bom: null, boardImage: null });
  const [activeComponent, setActiveComponent] = useState(null);
  const [manualBoard, setManualBoard] = useState({ name: 'Breadboard', mcuPart: 'STM32F401CDU6', componentRef: 'U2', componentPart: 'BMP180', scl: 'PB6', sda: 'PB7' });
  const fileRef = useRef(null);
  const projectRef = useRef(null);
  const diagnosticTimer = useRef(null);

  const profileValidation = useMemo(() => profile ? validateBoardProfile(profile) : null, [profile]);
  const activeSensor = profile?.components.find((item) => item.ref === activeComponent) || null;
  const sensorTest = testForComponent(catalog, activeSensor, profile?.mcu?.part);
  const testValidation = activeSensor ? validateTestTarget(profile, activeSensor.ref) : null;
  const testBlocker = !target?.connected ? 'Önce ESP32 üzerinden STM32 hedefini bul.'
    : !profile?.targetUid || profile.targetUid !== target.uid ? 'Bu kart profilini bağlı STM32 UID’siyle eşleştir.'
    : !githubUser ? 'Entegrasyonlar ekranından GitHub girişi yap.'
    : !catalogSha ? 'Özel test deposu kataloğu henüz yüklenmedi.'
    : !sensorTest ? 'Bu sensör için katalog eşlemesi yok.'
    : !buildableTargetPart(profile?.mcu?.part) ? 'Bu prototip yalnız STM32F401CC/CD/CE ve STM32F446RE firmware’i derler.'
    : sensorTest.status !== 'ready' ? 'Bu sensörün test kodu henüz hazır değil.'
    : !testValidation?.valid ? 'Önce sensör pinlerini doğrula ve onayla.' : null;
  const adminTest = catalog.tests.find((item) => item.id === adminTestId);

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

  useEffect(() => { loadSecret('ai_api_key').then((value) => value && setAiKey(value)).catch(() => {}); }, []);
  useEffect(() => { loadSecret('github_access_token').then(async (token) => { if (!token) return; try { setGithubUser(await currentGitHubUser(token)); } catch (_) {} }).catch(() => {}); }, []);

  useEffect(() => {
    if (!githubUser || !githubConfig.repository) return;
    let cancelled = false;
    setCatalogLoading(true);
    loadSecret('github_access_token').then(async (token) => {
      const [{ catalog: remote, sha }, canWrite] = await Promise.all([
        fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' }),
        catalogWritePermission({ token, repository: githubConfig.repository }),
      ]);
      const validation = validateTestCatalog(remote);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!cancelled) { setCatalog(remote); setCatalogSha(sha); setCatalogAdmin(canWrite); }
    }).catch((error) => { if (!cancelled) setNotice(`GitHub kataloğu alınamadı: ${error.message}`); }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [githubUser, githubConfig.repository, githubConfig.ref]);

  useEffect(() => () => window.clearInterval(diagnosticTimer.current), []);

  const waitForDiagnosticReport = async (expectedHashes) => {
    setDiagnosticReport({ state: 'WAITING', valid: false });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${normalizedBridge}/api/diagnostic/report`, { signal: AbortSignal.timeout(2500) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const report = await response.json();
        const matches = report.valid && (parseInt(report.testIdHash, 16) >>> 0) === expectedHashes.test
          && (parseInt(report.profileHash, 16) >>> 0) === expectedHashes.profile
          && (parseInt(report.runHash, 16) >>> 0) === expectedHashes.run;
        if (matches) {
          setDiagnosticReport(report);
          if (['PASS', 'FAIL', 'FATAL'].includes(report.state)) return report;
        }
      } catch (_) {
        // Reset sırasında kısa SWD kesintisi normaldir.
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error('STM32 geçerli ve bu çalıştırmaya ait SRAM test raporu üretmedi (30 saniye).');
  };

  const flashFirmware = async (selected = firmware) => {
    if (!selected) return setNotice('Önce bir .bin veya .elf seç.');
    if (flashBusy) return false;
    setFlashBusy(true);
    setFlashLog([]); setFlashProgress(0);
    try {
      const image = await prepareFirmware(selected, target?.flashSizeKb);
      const form = new FormData(); form.append('firmware', image, image.name);
      const upload = await fetch(`${normalizedBridge}/upload`, { method: 'POST', body: form });
      if (!upload.ok) throw new Error('Firmware ESP32 belleğine alınamadı.');
      setFlashLog((logs) => [...logs, `[YÜKLENDİ] ${selected.name} → ${image.size} bayt flash imajı`]);
      await new Promise((resolve, reject) => {
        const stream = new EventSource(`${normalizedBridge}/stream-flash`);
        const timer = window.setTimeout(() => { stream.close(); reject(new Error('Flash süresi aşıldı.')); }, 180000);
        const finish = (error) => { window.clearTimeout(timer); stream.close(); error ? reject(error) : resolve(); };
        stream.onmessage = ({ data }) => {
          let event;
          try { event = JSON.parse(data); } catch (_) { return; }
          if (event.msg) setFlashLog((logs) => [...logs.slice(-80), event.msg]);
          if (Number.isFinite(event.pct)) setFlashProgress(event.pct);
          if (event.error) finish(new Error(event.msg || 'ESP32 flash doğrulaması başarısız.'));
          else if (event.done) finish();
        };
        stream.onerror = () => finish(new Error('ESP32 flash akışı kesildi.'));
      });
      await refreshTarget();
      return true;
    } catch (error) { setNotice(`Flash başarısız: ${error.message}`); return false; }
    finally { setFlashBusy(false); }
  };

  const loadNetlist = async (file) => {
    if (session !== 'github' || !githubUser) { setNotice('Otomatik pin analizi için GitHub oturumu gerekli.'); return; }
    if (!file) return;
    try {
      const netlist = await file.text();
      const result = profileFromNetlist(netlist, { netlistName: file.name });
      setProfile(result.profile); setAnalysis(result.analysis);
      setSources((current) => ({ ...current, netlist })); setActiveComponent(result.profile.components[0]?.ref || null);
      setWorkbenchView('overview'); setMode('workbench'); setNotice(`${result.profile.components.length} cihaz adayı bulundu; pinleri onayla.`);
    } catch (error) { setNotice(`NET okunamadı: ${error.message}`); }
  };

  const createManualBoard = (event) => {
    event.preventDefault();
    try {
      const created = createManualI2cProfile(manualBoard);
      setProfile(created); setAnalysis(null); setSources({ netlist: null, schematic: null, bom: null, boardImage: null });
      setActiveComponent(created.components[0].ref);
      setNotice('Manuel kart profili açıldı. Testten önce SCL/SDA pinlerini kontrol edip onayla.');
    } catch (error) { setNotice(`Manuel profil oluşturulamadı: ${error.message}`); }
  };
  const updateManualBoard = (field, value) => setManualBoard((current) => ({ ...current, [field]: value }));

  const editConnection = (index, field, value) => setProfile((current) => {
    const connections = current.connections.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const pinChanged = field === 'mcuPin' && value !== item.mcuPin;
      const busChanged = field === 'peripheral' && value !== item.peripheral;
      const evidence = pinChanged ? { ...item.evidence, directTrace: false, namedNet: false, validAlternateFunction: false }
        : busChanged ? { ...item.evidence, validAlternateFunction: false } : item.evidence;
      const changed = { ...item, [field]: value, evidence, path: pinChanged ? [] : item.path,
        source: pinChanged || busChanged ? 'USER' : item.source, approved: pinChanged || busChanged ? false : item.approved };
      return { ...changed, confidence: confidenceForConnection(changed) };
    });
    return addAuditEvent({ ...current, connections }, 'PIN_OVERRIDE', { index, field, value });
  });

  const approveComponent = (componentRef) => setProfile((current) => {
    const connections = current.connections.map((item) => item.componentRef === componentRef ? { ...item, approved: true } : item);
    return addAuditEvent({ ...current, connections }, 'CONNECTIONS_APPROVED', { componentRef });
  });

  const updateAiConfig = (field, value) => setAiConfig((current) => {
    const next = { ...current, [field]: value };
    localStorage.setItem('stardrop.ai.config', JSON.stringify(next));
    return next;
  });

  const runAiReview = async () => {
    if (!profile) return;
    setAiBusy(true); setAiReview(null); setAcceptedSuggestions([]);
    try {
      await saveSecret('ai_api_key', aiKey);
      const review = await requestAiReview({ ...aiConfig, apiKey: aiKey, profile, netlist: sources.netlist, schematicPdf: sources.schematic });
      setAiReview(review); setNotice(`AI incelemesi ${review.suggestions.length} öneri üretti; hiçbir değişiklik uygulanmadı.`);
    } catch (error) { setNotice(`AI incelemesi başarısız: ${error.message}`); }
    finally { setAiBusy(false); }
  };

  const applySelectedAiSuggestions = () => {
    setProfile((current) => applyAiSuggestions(current, aiReview, acceptedSuggestions));
    setNotice(`${acceptedSuggestions.length} AI önerisi profile uygulandı; hepsi yeniden onay bekliyor.`);
  };

  const updateGithubConfig = (field, value) => setGithubConfig((current) => {
    const next = { ...current, [field]: value };
    localStorage.setItem('stardrop.github.config', JSON.stringify(next));
    return next;
  });

  const startGithubLogin = async () => {
    try {
      const device = await beginGitHubDeviceLogin(githubConfig.clientId);
      setDeviceLogin(device); setNotice('GitHub doğrulama kodunu açılan ayarlar ekranından onayla.');
      const expiresAt = Date.now() + device.expires_in * 1000;
      const interval = window.setInterval(async () => {
        if (Date.now() > expiresAt) { window.clearInterval(interval); setDeviceLogin(null); return; }
        try {
          const token = await pollGitHubDeviceLogin(githubConfig.clientId, device.device_code);
          if (!token) return;
          window.clearInterval(interval); await saveSecret('github_access_token', token);
          const user = await currentGitHubUser(token); setGithubUser(user); setDeviceLogin(null); setSession('github'); setMode('workbench'); setNotice(`GitHub girişi tamamlandı: ${user.login}`);
        } catch (error) { window.clearInterval(interval); setDeviceLogin(null); setNotice(`GitHub girişi başarısız: ${error.message}`); }
      }, Math.max(5000, (device.interval || 5) * 1000));
    } catch (error) { setNotice(`GitHub Device Login başlatılamadı: ${error.message}`); }
  };

  const updateAdminTest = (field, value) => setCatalog((current) => ({ ...current, tests: current.tests.map((item) => item.id === adminTestId ? { ...item, [field]: value } : item) }));

  const saveAdminCatalog = async () => {
    try {
      if (!catalogAdmin || !catalogSha) throw new Error('Bu depoda katalog yazma yetkisi yok.');
      const validation = validateTestCatalog(catalog);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      const token = await loadSecret('github_access_token');
      await saveCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', catalog, sha: catalogSha });
      const saved = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' });
      setCatalog(saved.catalog); setCatalogSha(saved.sha); setNotice('Sensör-test eşlemesi GitHub kataloğuna kaydedildi.');
    } catch (error) { setNotice(`Katalog kaydedilemedi: ${error.message}`); }
  };

  const runDiagnosticTest = async () => {
    if (testBusy || !profile || !activeSensor || !sensorTest) return;
    const validation = validateTestTarget(profile, activeSensor.ref);
    if (!validation.valid) { setNotice(validation.errors.join(' ')); return; }
    const selectedProfile = { schemaVersion: profile.schemaVersion, id: profile.id, name: profile.name, targetUid: profile.targetUid, mcu: profile.mcu,
      components: [activeSensor], connections: profile.connections.filter((item) => item.componentRef === activeSensor.ref && ['SCL', 'SDA'].includes(item.role)) };
    const scl = selectedProfile.connections.find((item) => item.role === 'SCL');
    const sda = selectedProfile.connections.find((item) => item.role === 'SDA');
    const requestId = crypto.randomUUID();
    setTestBusy(true); setDiagnosticReport(null);
    try {
      if (!githubUser || !githubConfig.repository || !catalogSha) throw new Error('Özel test deposuna GitHub girişi gerekli.');
      if (sensorTest.status !== 'ready' || !sensorTest.sourcePath) throw new Error('Bu sensörün derlenebilir test şablonu henüz yok.');
      if (!buildableTargetPart(profile.mcu.part)) throw new Error('Bu prototip yalnız STM32F401CC/CD/CE ve STM32F446RE destekler.');
      if (!target?.connected || !target.model?.startsWith(profile.mcu.family)) throw new Error('Bağlı STM32 ile kart profilinin MCU ailesi uyuşmuyor.');
      if (profile.targetUid !== target.uid) throw new Error('Kart profili bağlı STM32 UID’siyle eşleşmiyor.');
      if (!/^[0-9A-F]{24}$/.test(target.uid || '') || /^0+$/.test(target.uid)) throw new Error('Hedef STM32 UID güvenilir okunamadı.');
      const token = await loadSecret('github_access_token');
      if (!token) throw new Error('GitHub oturumu bulunamadı.');
      setTestStage('GitHub derlemesi başlatılıyor…');
      const startedAt = Date.now();
      await dispatchProfileBuild({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', profile: selectedProfile, testId: sensorTest.id, componentRef: activeSensor.ref, requestId });
      const { artifact } = await waitForProfileArtifact({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', actor: githubUser.login, requestId, testId: sensorTest.id, startedAt, onStatus: setTestStage });
      setTestStage('Firmware indiriliyor ve SHA-256 doğrulanıyor…');
      const { firmware: builtFirmware, manifest } = await downloadDiagnosticArtifact({ token, repository: githubConfig.repository, artifactId: artifact.id, expected: {
        testId: sensorTest.id, componentRef: activeSensor.ref, requestId, profileId: profile.id, targetUid: target.uid, mcuPart: profile.mcu.part.toUpperCase(),
        scl: scl.mcuPin, sda: sda.mcuPin, sourcePath: sensorTest.sourcePath, flashSizeKb: target.flashSizeKb,
      } });
      const liveResponse = await fetch(`${normalizedBridge}/api/target/status`, { signal: AbortSignal.timeout(6000) });
      if (!liveResponse.ok) throw new Error('Flash öncesi STM32 tekrar sorgulanamadı.');
      const liveTarget = await liveResponse.json();
      if (!liveTarget.connected || liveTarget.uid !== target.uid || !liveTarget.model?.startsWith(profile.mcu.family)) throw new Error('Bağlı kart değişti; yanlış STM32’ye kod yüklememek için durduruldu.');
      setTestStage('ESP32 üzerinden STM32 flashlanıyor…');
      if (!await flashFirmware(builtFirmware)) throw new Error('ESP32 flash işlemi başarısız.');
      setTestStage('STM32 SRAM test raporu bekleniyor…');
      const hashes = {
        test: hash32FromSha256(await sha256Hex(sensorTest.id)),
        profile: hash32FromSha256(await sha256Hex(JSON.stringify(selectedProfile))),
        run: hash32FromSha256(await sha256Hex(requestId)),
      };
      const report = await waitForDiagnosticReport(hashes);
      const outcome = report.state === 'PASS' ? 'PASS' : 'FAIL';
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref, testId: sensorTest.id, targetUid: liveTarget.uid, status: outcome, firmwareSha256: manifest.sha256, report }]);
      setTestStage(outcome === 'PASS' ? 'Test geçti.' : `Test başarısız: hata kodu ${report.error}`);
      setNotice(`${activeSensor.ref} · ${sensorTest.name}: ${outcome}`);
    } catch (error) {
      setTestStage(`Test durdu: ${error.message}`);
      setNotice(`Sensör testi başarısız: ${error.message}`);
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref, testId: sensorTest.id, status: 'ERROR', error: error.message }]);
    } finally { setTestBusy(false); }
  };

  const exportProject = async () => {
    try {
      const file = await exportStardropProject({ profile, netlist: sources.netlist, bom: sources.bom, schematicPdf: sources.schematic, boardImage: sources.boardImage, testHistory });
      const url = URL.createObjectURL(file); const link = document.createElement('a');
      link.href = url; link.download = `${profile.name}.stardrop`; link.click(); URL.revokeObjectURL(url);
      setNotice('Taşınabilir .stardrop paketi indirildi.');
    } catch (error) { setNotice(error.message); }
  };

  const importProject = async (file) => {
    try {
      const data = await importStardropProject(file); setProfile(data.profile); setTestHistory(data.testHistory || []);
      setSources({ netlist: data.sources['sources/board.NET'] ? await data.sources['sources/board.NET'].text() : null, schematic: data.sources['sources/schematic.pdf'] || null, bom: data.sources['sources/bom.csv'] ? await data.sources['sources/bom.csv'].text() : null, boardImage: Object.entries(data.sources).find(([path]) => path.startsWith('sources/board-image.'))?.[1] || null });
      setActiveComponent(data.profile.components[0]?.ref || null); setWorkbenchView('overview'); setMode('workbench'); setNotice('STARDROP projesi güvenle geri yüklendi.');
    } catch (error) { setNotice(`Proje açılamadı: ${error.message}`); }
  };

  const components = profile?.components || [];
  const componentConnections = profile?.connections.filter((item) => item.componentRef === activeComponent) || [];

  if (session === 'welcome') return <div className="welcome-screen"><aside className="welcome-sidebar"><div className="brand"><span className="brand-mark">✦</span><div><strong>STARDROP</strong><small>AVIONICS OTA</small></div></div><span>YILDIZ ROKET TAKIMI</span></aside><main className="welcome-content"><span className="eyebrow">BAŞLANGIÇ</span><h1>Çalışma alanı</h1><p>Nasıl devam etmek istersin?</p><div className="welcome-actions"><button className="welcome-primary" onClick={() => { if (githubUser) { setSession('github'); setMode('workbench'); } else if (githubConfig.clientId) startGithubLogin(); else setDeviceLogin({ setup: true }); }}><Github size={18} /><span><strong>{githubUser ? `@${githubUser.login} ile devam et` : 'GitHub ile devam et'}</strong><small>Kart analizi ve sensör testleri</small></span><b>→</b></button><button className="welcome-guest" onClick={() => { setSession('guest'); setMode('flash'); }}><Upload size={18} /><span><strong>Misafir olarak gir</strong><small>ESP32 üzerinden firmware yükle</small></span><b>→</b></button></div>{deviceLogin?.setup && <div className="welcome-setup"><label>GitHub App Client ID<input value={githubConfig.clientId || ''} onChange={(event) => updateGithubConfig('clientId', event.target.value)} placeholder="Iv1.…" /></label><small>GitHub uygulaması yapılandırılınca giriş açılır.</small><button disabled={!githubConfig.clientId} onClick={startGithubLogin}>Doğrulamayı başlat</button></div>}{deviceLogin?.user_code && <div className="welcome-setup"><strong>{deviceLogin.user_code}</strong><span><a href={deviceLogin.verification_uri} target="_blank" rel="noreferrer">{deviceLogin.verification_uri}</a> adresinde kodu onayla.</span></div>}<div className="welcome-status">{notice}</div></main></div>;

  if (session === 'guest') return <div className="guest-layout"><header className="guest-header"><div className="brand"><span className="brand-mark">✦</span><strong>STARDROP</strong></div><button onClick={() => setSession('welcome')}>Girişe dön</button></header><EspConsole bridge={bridge} setBridge={setBridge} target={target} notice={notice} refreshTarget={refreshTarget} firmware={firmware} setFirmware={setFirmware} flashFirmware={flashFirmware} flashLog={flashLog} flashProgress={flashProgress} flashBusy={flashBusy} setNotice={setNotice} /></div>;

  return <div className="app-shell">
    <aside className="rail">
      <div className="brand"><div className="brand-mark">✦</div><div><strong>STARDROP</strong><small>AVIONICS WORKBENCH</small></div></div>
      <nav>
        <button className={mode === 'flash' ? 'active' : ''} onClick={() => setMode('flash')}><Upload />Hızlı Yükleme</button>
        {session === 'github' && githubUser && <button className={mode === 'workbench' ? 'active' : ''} onClick={() => setMode('workbench')}><FlaskConical />Kart Workbench</button>}
        {session === 'github' && githubUser && <button className={mode === 'settings' ? 'active' : ''} onClick={() => setMode('settings')}><Settings />Entegrasyonlar</button>}
        {session === 'github' && githubUser && catalogAdmin && <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}><ShieldCheck />Test Yönetimi</button>}
      </nav>
      <div className="rail-footer"><span>{session === 'github' && githubUser ? `@${githubUser.login}` : 'MİSAFİR OTURUMU'}</span><button onClick={() => setSession('welcome')}>Girişe dön</button></div><div className="rail-status"><span className="status-dot" /><span>{notice}</span></div>
    </aside>
    <main>
      <header><div><h1>{mode === 'flash' ? 'PROGRAMLAYICI' : mode === 'settings' ? 'ENTEGRASYONLAR' : mode === 'admin' ? 'TEST YÖNETİMİ' : 'KART WORKBENCH'}</h1><p>{mode === 'flash' ? 'ESP32 / STM32 · iki sinyal hattı' : 'Kart profilleri ve sensör tanı iş akışı'}</p></div><div className="bridge"><Radio /><input value={bridge} onChange={(event) => setBridge(event.target.value)} aria-label="ESP32 adresi"/><button onClick={refreshTarget} title="Hedefi yenile"><RefreshCw /></button></div></header>
      {mode === 'admin' ? <div className="workspace settings-page"><Section title="SENSÖR → TEST KAYNAĞI" action={<Badge tone={catalogAdmin ? 'good' : 'bad'}>{catalogAdmin ? 'YAZMA YETKİSİ VAR' : 'YETKİ YOK'}</Badge>}><p>Bu ekran yalnız GitHub deposunda yazma yetkisi olan kullanıcıya açılır. Eşlemeler özel deponun katalog dosyasına kaydedilir; test kaynağı gerçekten derlenmeden operatöre “hazır” görünmez.</p><div className="admin-grid"><select value={adminTestId} onChange={(event) => setAdminTestId(event.target.value)}>{catalog.tests.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={adminTest?.sourcePath || ''} placeholder="templates/bmp180.c" onChange={(event) => updateAdminTest('sourcePath', event.target.value)} /><input value={adminTest?.matchParts?.join(', ') || ''} placeholder="BMP180, BMP085" onChange={(event) => updateAdminTest('matchParts', event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></div><p>Kaynak yolu, eşleşen parça adları ve desteklenen MCU bilgisi katalogda tutulur. Farklı kart pinleri firmware kaynak dosyasına gömülmez; onaylı BoardProfile derleme girdisidir.</p><button className="primary settings-login" disabled={!catalogAdmin || catalogLoading} onClick={saveAdminCatalog}><Save />GITHUB KATALOĞUNA KAYDET</button></Section></div> : mode === 'settings' ? <div className="workspace settings-page"><Section title="GITHUB WORKBENCH GİRİŞİ" action={githubUser ? <Badge tone="good">@{githubUser.login}</Badge> : <Badge tone="warn">GİRİŞ YOK</Badge>}><p>Hızlı Yükleme giriş gerektirmez. Bu giriş yalnız özel katalog, bulut derleme ve merkezi audit için kullanılır.</p><div className="settings-grid"><input value={githubConfig.clientId || ''} placeholder="GitHub App Client ID" onChange={(event) => updateGithubConfig('clientId', event.target.value)} /><input value={githubConfig.repository || ''} placeholder="owner/stardrop-diagnostics" onChange={(event) => updateGithubConfig('repository', event.target.value)} /><input value={githubConfig.ref || ''} placeholder="main" onChange={(event) => updateGithubConfig('ref', event.target.value)} /></div><button className="primary settings-login" disabled={!githubConfig.clientId || Boolean(githubUser)} onClick={startGithubLogin}><Github />{githubUser ? `GİRİŞ YAPILDI: ${githubUser.login}` : 'GITHUB DEVICE LOGIN'}</button>{deviceLogin?.user_code && <div className="device-code"><strong>{deviceLogin.user_code}</strong><span>Tarayıcıda <b>{deviceLogin.verification_uri}</b> adresini açıp bu kodu gir.</span></div>}</Section><Section title="GÜVENLİK DURUMU"><div className="security-list"><span><ShieldCheck />AI anahtarı: OS credential store</span><span><ShieldCheck />GitHub token: OS credential store</span><span><ShieldCheck />.stardrop export: anahtar ve token içermez</span></div></Section></div> : mode === 'flash' ? <EspConsole bridge={bridge} setBridge={setBridge} target={target} notice={notice} refreshTarget={refreshTarget} firmware={firmware} setFirmware={setFirmware} flashFirmware={flashFirmware} flashLog={flashLog} flashProgress={flashProgress} flashBusy={flashBusy} setNotice={setNotice} /> : <div className="workspace workbench">
        {!profile ? <>
          <Section title="KART DOSYASI"><div className="import-grid"><label className="dropzone"><FileUp /><strong>ALTIUM .NET İÇE AKTAR</strong><small>Elektriksel bağlantı analizi yerelde yapılır.</small><input ref={fileRef} type="file" accept=".net,.NET,.txt" onChange={(event) => loadNetlist(event.target.files?.[0])} /></label><label className="dropzone"><Download /><strong>.STARDROP AÇ</strong><small>Kaynaklar, profil ve test geçmişi tek dosyada.</small><input ref={projectRef} type="file" accept=".stardrop" onChange={(event) => importProject(event.target.files?.[0])} /></label></div></Section>
          <Section title="MANUEL KART / BREADBOARD"><p>.NET dosyan yoksa MCU ve sensör bağlantılarını elle gir. Pinler testten önce ayrıca onaylanır.</p>
            <form className="manual-grid" onSubmit={createManualBoard}>
              <label>Kart adı<input value={manualBoard.name} onChange={(event) => updateManualBoard('name', event.target.value)} /></label>
              <label>STM32 modeli<select value={manualBoard.mcuPart} onChange={(event) => updateManualBoard('mcuPart', event.target.value)}><option>STM32F401CCU6</option><option>STM32F401CDU6</option><option>STM32F401CEU6</option><option>STM32F446RET6</option></select></label>
              <label>Sensör parçası<input value={manualBoard.componentPart} onChange={(event) => updateManualBoard('componentPart', event.target.value)} /></label>
              <label>Referans<input value={manualBoard.componentRef} onChange={(event) => updateManualBoard('componentRef', event.target.value)} /></label>
              <label>SCL GPIO<input value={manualBoard.scl} onChange={(event) => updateManualBoard('scl', event.target.value)} /></label>
              <label>SDA GPIO<input value={manualBoard.sda} onChange={(event) => updateManualBoard('sda', event.target.value)} /></label>
              <button className="primary" type="submit">MANUEL PROFİL OLUŞTUR</button>
            </form>
          </Section>
        </> : <>
          <div className="workbench-tabs" role="tablist" aria-label="Kart çalışma alanı">{[['overview', 'Genel bakış'], ['pins', 'Pinler'], ['test', 'Sensör testi'], ['review', 'AI inceleme']].map(([view, title]) => <button key={view} role="tab" aria-selected={workbenchView === view} className={workbenchView === view ? 'active' : ''} onClick={() => setWorkbenchView(view)}>{title}</button>)}</div>
          <div className="summary-row"><Section title="KART PROFİLİ"><strong className="profile-name">{profile.name}</strong><p>{profile.mcu.part} · {components.length} cihaz adayı</p></Section><Section title={sources.netlist ? 'PARSER GÜVENİ' : 'MANUEL PROFİL'}><div className="confidence"><strong>{sources.netlist ? `${overallConfidence(profile)}%` : '—'}</strong><span>{!profileValidation.valid ? 'DÜZELTME GEREKİYOR' : profile.connections.some((item) => !item.approved) ? 'PIN ONAYI BEKLİYOR' : 'PROFİL DOĞRULANDI'}</span></div></Section><Section title="PROJE"><div className="summary-actions"><button className="secondary" onClick={exportProject}><Save />.STARDROP EXPORT</button><label className="secondary"><FileUp />{sources.schematic ? 'PDF EKLİ' : 'ŞEMA PDF EKLE'}<input type="file" accept="application/pdf,.pdf" onChange={(event) => setSources((current) => ({ ...current, schematic: event.target.files?.[0] || null }))} /></label></div></Section></div>
          {workbenchView === 'overview' && <Section title="KART GÖRÜNÜMÜ" action={<div className="board-map-actions"><Badge tone={target?.connected ? 'good' : 'warn'}>{target?.connected ? 'SWD BAĞLI' : 'HEDEF BEKLENİYOR'}</Badge>{target?.connected && <button className="secondary" onClick={() => setProfile((current) => addAuditEvent({ ...current, targetUid: target.uid }, 'TARGET_UID_BOUND', { uid: target.uid }))}>{profile.targetUid === target.uid ? 'UID EŞLEŞTİ' : 'BU STM32’YE EŞLEŞTİR'}</button>}</div>}><BoardMap profile={profile} components={components} target={target} image={sources.boardImage} selectedRef={activeComponent} onSelect={(ref) => { setActiveComponent(ref); setWorkbenchView('test'); }} onImageChange={(file) => { if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setNotice('Kart fotoğrafı PNG, JPEG veya WebP ve en fazla 8 MB olmalı.'); return; } setSources((current) => ({ ...current, boardImage: file })); }} /><p className="map-disclaimer">Düğümler okunabilirlik için yerleştirilir; fiziksel PCB koordinatı veya bağlantı doğrulaması anlamına gelmez. Bağlı hedef UID: {target?.uid || '—'} · Profil UID: {profile.targetUid || 'atanmadı'}</p></Section>}
          {workbenchView === 'pins' && <div className="work-grid"><Section title="BİLEŞENLER" action={<Badge>{components.length}</Badge>}><div className="component-list">{components.map((component) => <button key={component.ref} onClick={() => setActiveComponent(component.ref)} className={activeComponent === component.ref ? 'selected' : ''}><span><strong>{component.ref}</strong><small>{component.part}</small></span><Badge tone={profile.connections.filter((entry) => entry.componentRef === component.ref).every((entry) => entry.approved) ? 'good' : 'warn'}>{component.protocol || '?'}</Badge></button>)}</div></Section>
            <Section title={activeComponent ? `${activeComponent} PIN MATRİSİ` : 'PIN MATRİSİ'} action={activeComponent && <button className="secondary" onClick={() => approveComponent(activeComponent)}><ShieldCheck />ONAYLA</button>}>
              <div className="pin-table">{componentConnections.map((connection) => { const index = profile.connections.indexOf(connection); return <div className="pin-row" key={`${connection.componentRef}-${connection.role}-${index}`}><div><strong>{connection.role}</strong><small>{connection.sensorPin || '?'}</small></div><input value={connection.mcuPin || ''} onChange={(event) => editConnection(index, 'mcuPin', event.target.value.toUpperCase())}/><input value={connection.peripheral || ''} onChange={(event) => editConnection(index, 'peripheral', event.target.value.toUpperCase())}/><Badge tone={connection.approved ? 'good' : connection.confidence >= 60 ? 'warn' : 'bad'}>{connection.approved ? 'ONAYLI' : `${connection.confidence}%`}</Badge></div>; })}</div>
              {activeSensor?.protocol === 'I2C' && <p className="catalog-note">Donanımsal I²C pinleri dışındaki bağlantılar için SCL ve SDA satırlarının bus alanına aynı <code>SOFT_I2C_1</code> değerini yaz. Test yazılımı bu pinleri yazılımsal I²C ile sürer; SWD veya pakette bulunmayan pinler kullanılamaz.</p>}
              {!!profileValidation.errors.length && <div className="validation bad"><strong>Derleme engelleri</strong>{profileValidation.errors.map((error) => <span key={error}>{error}</span>)}</div>}
              {!!profileValidation.warnings.length && <div className="validation warn"><strong>İnceleme notları</strong>{profileValidation.warnings.slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)}</div>}
            </Section></div>}
          {workbenchView === 'review' && <Section title="AI DESTEKLİ İNCELEME" action={<Badge tone={sources.schematic ? 'good' : 'warn'}>{sources.schematic ? 'NET + PDF' : 'SADECE NET'}</Badge>}>
            <p className="ai-consent">İstek gönderildiğinde profil, `.NET` özeti ve eklediğin şema PDF’si seçtiğin sağlayıcıya gider. API anahtarı yalnız işletim sisteminin credential store’unda tutulur.</p>
            <div className="ai-config"><input value={aiConfig.endpoint || ''} placeholder="https://api.openai.com/v1" onChange={(event) => updateAiConfig('endpoint', event.target.value)} /><input value={aiConfig.model || ''} placeholder="Model" onChange={(event) => updateAiConfig('model', event.target.value)} /><input type="password" value={aiKey} placeholder="API anahtarı" onChange={(event) => setAiKey(event.target.value)} /></div>
            <button className="primary ai-run" disabled={aiBusy || !aiKey} onClick={runAiReview}><ShieldCheck />{aiBusy ? 'AI İNCELİYOR…' : 'AI İNCELEMESİNİ BAŞLAT'}</button>
            {aiReview && <div className="ai-result"><strong>{aiReview.summary}</strong>{aiReview.suggestions.length === 0 ? <p>AI düzeltme önermedi.</p> : aiReview.suggestions.map((suggestion) => <label key={suggestion.id} className="ai-suggestion"><input type="checkbox" checked={acceptedSuggestions.includes(suggestion.id)} onChange={(event) => setAcceptedSuggestions((items) => event.target.checked ? [...items, suggestion.id] : items.filter((id) => id !== suggestion.id))}/><span><b>{suggestion.confidence}% · bağlantı #{suggestion.connectionIndex + 1}</b><small>{suggestion.reason} — {suggestion.evidence}</small></span></label>)}{aiReview.suggestions.length > 0 && <button className="secondary" disabled={!acceptedSuggestions.length} onClick={applySelectedAiSuggestions}>SEÇİLİ ÖNERİLERİ UYGULA</button>}</div>}
          </Section>}
          {workbenchView === 'test' && <Section title="SENSÖR TESTİ" action={activeSensor && <Badge>{activeSensor.ref}</Badge>}>
            {!activeSensor ? <p>Ortadaki kart haritasından test etmek istediğin sensörü seç.</p> : <div className="sensor-test-detail"><div><Activity size={20} /><strong>{activeSensor.part}</strong><span>{activeSensor.ref} · {activeSensor.protocol || 'Protokol bilinmiyor'}</span></div><p>{sensorTest ? `${sensorTest.name} testi katalogda eşleşti.` : 'Bu sensör için katalogda eşleşen test yok; yönetici eşlemesi gerekiyor.'}</p>{sensorTest && <p>Durum: {sensorTest.status === 'ready' ? 'Derlenebilir şablon hazır' : 'Test firmware şablonu henüz üretilmedi'} · Kaynak: {sensorTest.sourcePath || 'Atanmadı'}</p>}{activeSensor && !validateTestTarget(profile, activeSensor.ref).valid && <div className="validation warn">{validateTestTarget(profile, activeSensor.ref).errors.map((error) => <span key={error}>{error}</span>)}</div>}<p className="destructive-note">Test, STM32’nin mevcut firmware’ini silip tanı firmware’ini yükler. Sonrasında üretim yazılımını yeniden yüklemen gerekir.</p><button className="primary" disabled={testBusy || Boolean(testBlocker)} onClick={runDiagnosticTest}><Send />{testBusy ? 'TEST ÇALIŞIYOR…' : 'TEST FIRMWARE’İNİ YÜKLE VE BAŞLAT'}</button><small>{testStage || 'Onaylı pinler ve GitHub bağlantısı hazır olduğunda derlenir, flashlanır ve sonuç okunur.'}</small></div>}
            {diagnosticReport && <div className={`diagnostic ${diagnosticReport.state?.toLowerCase() || 'waiting'}`}><div><strong>SRAM RAPORU · {diagnosticReport.state || 'BEKLENİYOR'}</strong><small>{diagnosticReport.valid ? `Hata: ${diagnosticReport.error} · ${diagnosticReport.elapsedMs ?? 0} ms` : diagnosticReport.reason || 'Test firmware’i rapor yazıyor veya henüz başlamadı.'}</small></div>{diagnosticReport.valid && <div className="measurements"><span>ID {diagnosticReport.observedDeviceId}</span><span>{sensorTest?.id === 'generic-i2c' ? `YANIT VEREN ADRES SAYISI ${diagnosticReport.detailCode}` : `HAM ÖRNEK ${diagnosticReport.detailCode}`}</span></div>}</div>}
            {activeSensor && testBlocker && <div className="validation warn">{testBlocker}</div>}
            {activeSensor && sensorTest?.id === 'generic-i2c' && <p className="catalog-note">Genel I²C testi yalnız bus üzerinde ACK alındığını gösterir; seçilen sensörün kimliğini veya ölçümünü doğrulamaz.</p>}
            {testHistory.length > 0 && <p className="catalog-note">Son test: {testHistory.at(-1).componentRef} · {testHistory.at(-1).status} · {new Date(testHistory.at(-1).at).toLocaleString('tr-TR')}</p>}
          </Section>}
        </>}
      </div>}
    </main>
  </div>;
}
