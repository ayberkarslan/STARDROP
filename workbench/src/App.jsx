import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, BookOpen, Download, FileUp, FlaskConical, Github, RefreshCw, Save, Send, Settings, ShieldCheck, Upload } from 'lucide-react';
import { addAuditEvent, confidenceForConnection, createManualI2cProfile, createManualLedProfile, overallConfidence, supportedPeripheral, validateBoardProfile, validateTestTarget } from './lib/boardProfile.js';
import { applyAiSuggestions, requestAiReview } from './lib/aiReview.js';
import { profileFromNetlist } from './lib/netlistProfile.js';
import { exportStardropProject, importStardropProject } from './lib/projectArchive.js';
import { deleteSecret, loadSecret, saveSecret } from './lib/secretStore.js';
import { clearGitHubSession, saveGitHubSession, validGitHubToken } from './lib/githubAuth.js';
import { catalogWritePermission, currentGitHubUser, fetchCatalogDocument, listLibraryEntries, publishLibraryEntry, saveCatalogDocument } from './lib/githubClient.js';
import { hash32FromSha256, sha256Hex } from './lib/diagnosticArtifact.js';
import BoardMap from './BoardMap.jsx';
import WorkbenchWizard from './WorkbenchWizard.jsx';
import BrandMark from './BrandMark.jsx';
import TestLibrary from './TestLibrary.jsx';
import EspConsole from './EspConsole.jsx';
import SelectMenu from './SelectMenu.jsx';
import DeviceLogin from './DeviceLogin.jsx';
import { prepareFirmware } from './lib/firmwareImage.js';
import { discoveryCandidates, discoverEspDevices, normalizeEspAddress, probeEsp } from './lib/espConnection.js';
import { espJson, espStream, espUpload } from './lib/espTransport.js';
import { buildableTargetPart, testsForComponent, validateTestCatalog } from './lib/testCatalog.js';
import CODE_REPO_CATALOG from '../../code-repo/catalog/catalog.json' with { type: 'json' };
import { makeLibraryEntry, validateLibraryEntry } from './lib/testLibrary.js';

const savedBridge = localStorage.getItem('stardrop.bridge') || 'http://192.168.4.1';
const mcuOptions = ['STM32F401CCU6', 'STM32F401CDU6', 'STM32F401CEU6', 'STM32F446RET6'].map((value) => ({ value, label: value }));
const ledTypeOptions = [{ value: 'low', label: 'Aktif düşük · BlackPill LED' }, { value: 'high', label: 'Aktif yüksek · harici LED' }];

function Badge({ children, tone = 'muted' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function Section({ title, children, action }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

function EspStatus({ esp, onRetry, disabled = false }) {
  const wifi = esp.wifi;
  const title = esp.status === 'online' ? `${wifi?.connected ? wifi.ssid : wifi?.apSsid || 'ESP32 AP'} · ${wifi?.ip || esp.base}`
    : esp.status === 'searching' ? 'ESP32 aranıyor…' : 'ESP32 çevrimdışı';
  const signal = esp.status === 'online' && wifi?.connected ? `${wifi.rssi} dBm` : esp.status === 'online' ? 'AP' : '';
  return <button className={`esp-status ${esp.status}`} onClick={onRetry} disabled={disabled} title={esp.status === 'online' ? `ESP32 ${esp.base} · yeniden tara` : 'ESP32’yi yeniden ara'}><span className="esp-status-dot"/><span><strong>{title}</strong>{signal && <small>{signal}</small>}</span><RefreshCw size={13}/></button>;
}

export default function App() {
  const [session, setSession] = useState('welcome');
  const [mode, setMode] = useState('flash');
  const [workbenchView, setWorkbenchView] = useState('overview');
  const [advancedWorkbench, setAdvancedWorkbench] = useState(false);
  const [bridge, setBridge] = useState(savedBridge);
  const [activeBridge, setActiveBridge] = useState(null);
  const [esp, setEsp] = useState({ status: 'searching', wifi: null, base: null });
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const discoveryRun = useRef(0);
  const healthMisses = useRef(0);
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('ESP32 programlayıcı bekleniyor.');
  const [firmware, setFirmware] = useState(null);
  const [flashLog, setFlashLog] = useState([]);
  const appendFlashLog = (msg, type = 'info') => setFlashLog((logs) => [...logs.slice(-299), {
    msg, type, time: new Date().toLocaleTimeString('tr-TR'),
  }]);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashBusy, setFlashBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testStage, setTestStage] = useState('');
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [testHistory, setTestHistory] = useState([]);
  const [libraryEntries, setLibraryEntries] = useState([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [sourceStatus, setSourceStatus] = useState(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [confirmLedFlash, setConfirmLedFlash] = useState(false);
  const [visualPending, setVisualPending] = useState(null);
  const [aiConfig, setAiConfig] = useState(() => JSON.parse(localStorage.getItem('stardrop.ai.config') || '{"endpoint":"https://api.openai.com/v1","model":"gpt-4.1-mini"}'));
  const [aiKey, setAiKey] = useState('');
  const [aiReview, setAiReview] = useState(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [githubConfig, setGithubConfig] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('stardrop.code.config') || '{}');
    return { repository: saved.repository || 'ayberkarslan/stardrop-code-repo', ref: saved.ref || 'main' };
  });
  const [repoToken, setRepoToken] = useState('');
  const [repoTokenSaved, setRepoTokenSaved] = useState(false);
  const [secretStorageMode, setSecretStorageMode] = useState('os');
  const [repoCredentialRevision, setRepoCredentialRevision] = useState(0);
  const [repoDiagnostic, setRepoDiagnostic] = useState(null);
  const [repoDiagnosticBusy, setRepoDiagnosticBusy] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('led-blink');
  const [githubUser, setGithubUser] = useState(null);
  const [catalog, setCatalog] = useState(CODE_REPO_CATALOG);
  const [catalogSha, setCatalogSha] = useState(null);
  const [catalogAdmin, setCatalogAdmin] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [adminTestId, setAdminTestId] = useState(CODE_REPO_CATALOG.tests[0]?.id || '');
  const [githubLoginBusy, setGithubLoginBusy] = useState(false);
  const [githubLoginError, setGithubLoginError] = useState('');
  const [deviceLogin, setDeviceLogin] = useState(null);
  const loginAttempt = useRef(0);
  const [githubLogoutBusy, setGithubLogoutBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [sources, setSources] = useState({ netlist: null, schematic: null, bom: null, boardImage: null });
  const [activeComponent, setActiveComponent] = useState(null);
  const [manualBoard, setManualBoard] = useState({ name: 'Breadboard', mcuPart: 'STM32F401CDU6', componentRef: 'U2', componentPart: 'BMP180', scl: 'PB6', sda: 'PB7' });
  const [manualKind, setManualKind] = useState('led');
  const [manualLed, setManualLed] = useState({ pin: 'PC13', activeLow: true, blinkMs: 100 });
  const fileRef = useRef(null);
  const projectRef = useRef(null);
  const diagnosticTimer = useRef(null);

  const profileValidation = useMemo(() => profile ? validateBoardProfile(profile) : null, [profile]);
  const activeSensor = profile?.components.find((item) => item.ref === activeComponent) || null;
  const isLedTest = activeSensor?.protocol === 'GPIO' && activeSensor?.part === 'LED';
  const compatibleTests = testsForComponent(catalog, activeSensor, profile?.mcu?.part, { readyOnly: true });
  const selectedTest = compatibleTests.find((item) => item.id === selectedTestId) || compatibleTests[0] || null;
  const testValidation = activeSensor ? validateTestTarget(profile, activeSensor.ref, selectedTest?.requiredRoles) : null;
  const testBlocker = !target?.connected ? 'Önce ESP32 üzerinden STM32 hedefini bul.'
    : !profile?.targetUid || profile.targetUid !== target.uid ? 'Bu kart profilini bağlı STM32 UID’siyle eşleştir.'
    : !githubUser ? 'Entegrasyonlar ekranından GitHub girişi yap.'
    : !buildableTargetPart(profile?.mcu?.part) ? 'Bu GitHub HAL derleyicisi yalnız STM32F401CC/CD hedefinde doğrulandı.'
    : !selectedTest ? 'Bu bileşen için hazır test kataloğa henüz eklenmedi.'
    : selectedTest.build !== 'stm32-hal-v1' || !['visual', 'sram'].includes(selectedTest.result) ? 'Bu test için desteklenen kaynak veya sonuç sözleşmesi yok.'
    : !sourceStatus?.activeSha ? 'Önce test kaynağını GitHub’dan indir.'
    : isLedTest && (!Number.isInteger(activeSensor.blinkMs) || activeSensor.blinkMs < 50 || activeSensor.blinkMs > 5000) ? 'Blink aralığı 50–5000 ms olmalı.'
    : !testValidation?.valid ? 'Önce sensör pinlerini doğrula ve onayla.' : null;
  const adminTest = catalog.tests.find((item) => item.id === adminTestId);

  const normalizedBridge = activeBridge || bridge.replace(/\/$/, '');
  const refreshTargetAt = async (base) => {
    setNotice('SWD hedefi sorgulanıyor…');
    try {
      const nextTarget = await espJson(base, '/api/target/status', { timeoutMs: 6000 });
      setTarget(nextTarget);
      setNotice(nextTarget.connected ? `${nextTarget.label || nextTarget.model} hazır.`
        : nextTarget.dpConnected ? `SWD DAP bağlı (${nextTarget.dpIdcode}); STM32 okunamadı: ${nextTarget.stage}, ACK ${nextTarget.ack ?? '-'}.`
        : `SWD bağlantısı kurulamadı (ACK ${nextTarget.ack ?? '-'}).`);
    } catch (error) {
      setTarget(null);
      setNotice(`SWD hedefi sorgulanamadı: ${error.message}`);
    }
  };

  const connectBridge = async (address) => {
    const run = ++discoveryRun.current;
    setEsp((current) => ({ ...current, status: 'searching' }));
    try {
      const result = await probeEsp(address);
      if (run !== discoveryRun.current) return;
      const matched = discoveredDevices.find((device) => device.replyAddress === new URL(result.base).hostname || device.ip === new URL(result.base).hostname);
      if (matched?.mac) localStorage.setItem('stardrop.esp.mac', matched.mac);
      setActiveBridge(result.base); setBridge(result.base);
      localStorage.setItem('stardrop.bridge', result.base);
      setEsp({ status: 'online', ...result });
      healthMisses.current = 0;
      await refreshTargetAt(result.base);
    } catch (error) {
      if (run !== discoveryRun.current) return;
      setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
      setNotice(`ESP32’ye erişilemedi: ${error.message}`);
    }
  };

  const autoConnect = async () => {
    const run = ++discoveryRun.current;
    setEsp((current) => ({ ...current, status: 'searching' }));
    let devices = [];
    try { devices = await discoverEspDevices(); } catch (_) { /* Web önizlemede UDP yok. */ }
    if (run !== discoveryRun.current) return;
    setDiscoveredDevices(devices);
    const candidates = discoveryCandidates(devices, localStorage.getItem('stardrop.bridge') || savedBridge, localStorage.getItem('stardrop.esp.mac'));
    for (const address of candidates) {
      try {
        const result = await probeEsp(address, 2200);
        if (run !== discoveryRun.current) return;
        const device = devices.find((item) => normalizeEspAddress(item.replyAddress) === result.base || normalizeEspAddress(item.ip) === result.base);
        if (device?.mac) localStorage.setItem('stardrop.esp.mac', device.mac);
        setActiveBridge(result.base); setBridge(result.base);
        localStorage.setItem('stardrop.bridge', result.base);
        setEsp({ status: 'online', ...result });
        healthMisses.current = 0;
        await refreshTargetAt(result.base);
        return;
      } catch (_) { /* Sonraki adresi dene. */ }
    }
    if (run !== discoveryRun.current) return;
    setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
    setNotice('ESP32 bulunamadı. PC ile ESP aynı ağa bağlı mı?');
  };

  const refreshTarget = () => {
    try {
      const typed = normalizeEspAddress(bridge);
      if (typed !== activeBridge) return connectBridge(typed);
    } catch (_) { return connectBridge(bridge); }
    return esp.status === 'online' && activeBridge ? refreshTargetAt(activeBridge) : autoConnect();
  };

  useEffect(() => { autoConnect(); return () => { discoveryRun.current++; }; }, []);
  useEffect(() => {
    if (flashBusy || esp.status === 'searching') return;
    const timer = window.setInterval(async () => {
      if (esp.status !== 'online') { autoConnect(); return; }
      try {
        const live = await probeEsp(esp.base, 4000);
        healthMisses.current = 0;
        setEsp({ status: 'online', ...live });
      } catch (_) {
        if (++healthMisses.current >= 2) {
          setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
          setNotice('ESP32 bağlantısı kesildi; yeniden aranıyor.');
        }
      }
    }, esp.status === 'online' ? 10000 : 15000);
    return () => window.clearInterval(timer);
  }, [esp.status, esp.base, flashBusy]);

  useEffect(() => { loadSecret('ai_api_key').then((value) => value && setAiKey(value)).catch(() => {}); }, []);
  useEffect(() => { loadSecret('github_repo_token').then((value) => setRepoTokenSaved(Boolean(value))).catch(() => {}); }, []);
  useEffect(() => { validGitHubToken().then(async (token) => { if (!token) return; try { setGithubUser(await currentGitHubUser(token)); } catch (_) {} }).catch(() => {}); }, []);

  const validRepoToken = async () => (await loadSecret('github_repo_token')) || validGitHubToken();

  useEffect(() => {
    if (!githubUser || !githubConfig.repository) return;
    let cancelled = false;
    setCatalogLoading(true);
    validRepoToken().then(async (token) => {
      const [{ catalog: remote, sha }, canWrite] = await Promise.all([
        fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' }),
        catalogWritePermission({ token, repository: githubConfig.repository }),
      ]);
      const validation = validateTestCatalog(remote);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!cancelled) { setCatalog(remote); setCatalogSha(sha); setCatalogAdmin(canWrite); }
    }).catch((error) => { if (!cancelled) setNotice(`GitHub kataloğu alınamadı: ${error.message}`); }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [githubUser, githubConfig.repository, githubConfig.ref, repoCredentialRevision]);

  useEffect(() => {
    if (!githubUser) { setSourceStatus(null); return; }
    if (!githubConfig.repository && !import.meta.env.DEV) { setSourceStatus(null); return; }
    let cancelled = false;
    setSourceStatus(null);
    invoke('code_repo_status', { repository: githubConfig.repository, reference: githubConfig.ref || 'main' })
      .then((status) => { if (!cancelled) { setSourceStatus(status); setSourceError(status.warning || ''); } })
      .catch((error) => { if (!cancelled) setSourceError(String(error)); });
    return () => { cancelled = true; };
  }, [githubUser, githubConfig.repository, githubConfig.ref, repoCredentialRevision]);

  const refreshSource = async () => {
    if (!githubUser) return;
    setSourceBusy(true);
    try {
      const status = await invoke('code_repo_status', { repository: githubConfig.repository, reference: githubConfig.ref || 'main' });
      setSourceStatus(status); setSourceError(status.warning || '');
      const token = await validRepoToken();
      const remote = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: status.latestSha || status.activeSha || githubConfig.ref || 'main' });
      const validation = validateTestCatalog(remote.catalog);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      setCatalog(remote.catalog); setCatalogSha(remote.sha);
    } catch (error) { setSourceError(String(error)); }
    finally { setSourceBusy(false); }
  };

  const activateSource = async () => {
    if (!githubUser || !sourceStatus?.latestSha) return false;
    setSourceBusy(true);
    try {
      const status = await invoke('activate_code_repo', { repository: githubConfig.repository, sha: sourceStatus.latestSha });
      setSourceStatus(status); setSourceError('');
      const token = await validRepoToken();
      const remote = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: status.activeSha || githubConfig.ref || 'main' });
      const validation = validateTestCatalog(remote.catalog);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      setCatalog(remote.catalog); setCatalogSha(remote.sha);
      return true;
    } catch (error) { setSourceError(String(error)); return false; }
    finally { setSourceBusy(false); }
  };

  useEffect(() => () => window.clearInterval(diagnosticTimer.current), []);

  const waitForDiagnosticReport = async (expectedHashes, allowRunning = false) => {
    setDiagnosticReport({ state: 'WAITING', valid: false });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        const report = await espJson(normalizedBridge, '/api/diagnostic/report', { timeoutMs: 2500 });
        const matches = report.valid && (parseInt(report.testIdHash, 16) >>> 0) === expectedHashes.test
          && (parseInt(report.profileHash, 16) >>> 0) === expectedHashes.profile
          && (parseInt(report.runHash, 16) >>> 0) === expectedHashes.run;
        if (matches) {
          setDiagnosticReport(report);
          if (['PASS', 'FAIL', 'FATAL'].includes(report.state) || (allowRunning && report.state === 'RUNNING')) return report;
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
    if (esp.status !== 'online' || !activeBridge || !target?.connected) return setNotice('Önce ESP32 ve STM32 hedef bağlantısını doğrula.');
    if (flashBusy) return false;
    setFlashBusy(true);
    setFlashLog([{ msg: 'Yazılım ESP32 belleğine aktarılıyor...', type: 'info', time: new Date().toLocaleTimeString('tr-TR') }]);
    setFlashProgress(0);
    try {
      const image = await prepareFirmware(selected, target?.flashSizeKb);
      await espUpload(normalizedBridge, image);
      appendFlashLog(`Yazılım belleğe alındı. SWD Flash akışı başlıyor... (${selected.name}, ${image.size} bayt)`, 'success');
      await espStream(normalizedBridge, '/stream-flash', (event) => {
        if (event.msg) appendFlashLog(event.msg, event.type || 'info');
        if (Number.isFinite(event.pct)) setFlashProgress(event.pct);
      });
      appendFlashLog('🎉 STM32 başarıyla programlandı ve çalıştırıldı!', 'success');
      await refreshTargetAt(activeBridge);
      return true;
    } catch (error) { appendFlashLog(`Hata: ${error.message}`, 'error'); setNotice(`Flash başarısız: ${error.message}`); return false; }
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
      return true;
    } catch (error) { setNotice(`NET okunamadı: ${error.message}`); return false; }
  };

  const createManualBoard = (event) => {
    event.preventDefault();
    try {
      const created = manualKind === 'led'
        ? createManualLedProfile({ name: manualBoard.name, mcuPart: manualBoard.mcuPart, ...manualLed })
        : createManualI2cProfile(manualBoard);
      setProfile(created); setAnalysis(null); setSources({ netlist: null, schematic: null, bom: null, boardImage: null });
      setActiveComponent(created.components[0].ref);
      setNotice('Manuel kart profili açıldı. Testten önce pinleri kontrol edip onayla.');
    } catch (error) { setNotice(`Manuel profil oluşturulamadı: ${error.message}`); }
  };
  const updateManualBoard = (field, value) => setManualBoard((current) => ({ ...current, [field]: value }));

  const editConnection = (index, field, value) => { setVisualPending(null); setProfile((current) => {
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
  }); };

  const approveComponent = (componentRef) => setProfile((current) => {
    const connections = current.connections.map((item) => item.componentRef === componentRef ? { ...item, approved: true } : item);
    return addAuditEvent({ ...current, connections }, 'CONNECTIONS_APPROVED', { componentRef });
  });

  const updateLedSetting = (field, value) => {
    setVisualPending(null);
    setProfile((current) => addAuditEvent({ ...current, components: current.components.map((component) =>
      component.ref === activeComponent ? { ...component, [field]: value } : component) }, 'LED_CONFIG_CHANGED', { componentRef: activeComponent, field, value }));
  };

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
    localStorage.setItem('stardrop.code.config', JSON.stringify(next));
    return next;
  });

  const saveRepoAccess = async () => {
    try {
      if (!repoToken.trim()) throw new Error('Depo anahtarı boş.');
      setSecretStorageMode(await saveSecret('github_repo_token', repoToken.trim()));
      setRepoToken(''); setRepoTokenSaved(true); setRepoCredentialRevision((value) => value + 1);
      const result = await invoke('github_repo_diagnostic', { repository: githubConfig.repository });
      setRepoDiagnostic(result);
      if (result.userStatus !== 200) setNotice(`Anahtar kaydedildi ama GitHub hesabı reddetti (HTTP ${result.userStatus}). Erişim tanısına bak.`);
      else if (result.repositoryStatus !== 200) setNotice(`GitHub hesabı tanındı fakat depoya erişemiyor (HTTP ${result.repositoryStatus}). Erişim tanısına bak.`);
      else { setNotice('Depo anahtarı doğrulandı. Test kaynağı yenileniyor.'); await refreshSource(); }
    } catch (error) { setNotice(`Depo anahtarı kaydedilemedi: ${error.message}`); }
  };
  const removeRepoAccess = async () => {
    try { await deleteSecret('github_repo_token'); setRepoTokenSaved(false); setRepoDiagnostic(null); setRepoCredentialRevision((value) => value + 1); setNotice('Depo erişim anahtarı silindi.'); }
    catch (error) { setNotice(`Anahtar silinemedi: ${error.message}`); }
  };

  const runRepoDiagnostic = async () => {
    setRepoDiagnosticBusy(true);
    try {
      const result = await invoke('github_repo_diagnostic', { repository: githubConfig.repository });
      setRepoDiagnostic(result);
    } catch (error) { setRepoDiagnostic({ error: String(error) }); }
    finally { setRepoDiagnosticBusy(false); }
  };

  const startGithubLogin = async () => {
    if (githubLoginBusy) return;
    const attempt = ++loginAttempt.current;
    setGithubLoginBusy(true);
    setGithubLoginError('');
    setNotice('GitHub cihaz kodu hazırlanıyor…');
    try {
      if (!window.__TAURI_INTERNALS__) throw new Error('GitHub girişi masaüstü uygulamasında kullanılabilir.');
      const { invoke } = await import('@tauri-apps/api/core');
      const challenge = JSON.parse(await invoke('github_device_start'));
      if (attempt !== loginAttempt.current) return;
      const expiresIn = Math.min(Math.max(Number(challenge.expires_in) || 900, 60), 900);
      const deadline = Date.now() + expiresIn * 1000;
      let interval = Math.min(Math.max(Number(challenge.interval) || 5, 5), 30);
      setDeviceLogin({ userCode: challenge.user_code, expiresIn });
      setNotice('GitHub doğrulama kodunu onaylamanı bekliyorum.');
      let result;
      while (Date.now() < deadline && attempt === loginAttempt.current) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
        if (attempt !== loginAttempt.current) return;
        const poll = JSON.parse(await invoke('github_device_poll', { deviceCode: challenge.device_code }));
        if (attempt !== loginAttempt.current) return;
        if (poll.access_token) { result = poll; break; }
        if (poll.error === 'authorization_pending') continue;
        if (poll.error === 'slow_down') { interval = Math.min(Math.max(Number(poll.interval) || interval + 5, interval + 5), 60); continue; }
        throw new Error(poll.error_description || poll.error || 'GitHub giriş isteğini reddetti.');
      }
      if (!result) throw new Error('GitHub doğrulama kodunun süresi doldu; yeniden dene.');
      result.auth_method = 'device';
      const user = await currentGitHubUser(result.access_token);
      if (attempt !== loginAttempt.current) return;
      await saveGitHubSession(result);
      setSecretStorageMode(result.storage_mode);
      setGithubUser(user); setSession('github'); setMode('workbench');
      setNotice(result.storage_mode === 'memory'
        ? `GitHub girişi tamamlandı: ${user.login}. OS anahtar kasası bulunamadı; oturum yalnız uygulama kapanana kadar bellekte.`
        : `GitHub girişi tamamlandı: ${user.login}`);
    } catch (error) {
      if (attempt !== loginAttempt.current) return;
      const detail = typeof error === 'string' ? error : error?.message || String(error);
      setGithubLoginError(detail);
      setNotice(`GitHub girişi başarısız: ${detail}`);
    }
    finally { if (attempt === loginAttempt.current) { setGithubLoginBusy(false); setDeviceLogin(null); } }
  };

  const cancelGithubLogin = () => {
    loginAttempt.current += 1;
    setGithubLoginBusy(false);
    setDeviceLogin(null);
    setNotice('GitHub girişi iptal edildi.');
  };

  const logoutGithub = async () => {
    if (githubLogoutBusy) return;
    setGithubLogoutBusy(true);
    try {
      if (githubUser?.login) await invoke('clear_source_cache', { account: githubUser.login });
      await clearGitHubSession();
      await deleteSecret('github_repo_token');
      setRepoTokenSaved(false);
      setGithubUser(null);
      setSourceStatus(null);
      setCatalog(CODE_REPO_CATALOG);
      setCatalogSha(null);
      setCatalogAdmin(false);
      setSession('welcome');
      setNotice('GitHub oturumu kapatıldı. Yeniden giriş yapabilirsin.');
    } catch (error) { setNotice(`Çıkış başarısız: ${error.message}`); }
    finally { setGithubLogoutBusy(false); }
  };

  const updateAdminTest = (field, value) => setCatalog((current) => ({ ...current, tests: current.tests.map((item) => item.id === adminTestId ? { ...item, [field]: value } : item) }));

  const saveAdminCatalog = async () => {
    try {
      if (!catalogAdmin || !catalogSha) throw new Error('Bu depoda katalog yazma yetkisi yok.');
      const validation = validateTestCatalog(catalog);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      const token = await validRepoToken();
      await saveCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', catalog, sha: catalogSha });
      const saved = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' });
      setCatalog(saved.catalog); setCatalogSha(saved.sha); setNotice('Sensör-test eşlemesi GitHub kataloğuna kaydedildi.');
    } catch (error) { setNotice(`Katalog kaydedilemedi: ${error.message}`); }
  };

  const installTestCatalog = async () => {
    try {
      const token = await validRepoToken();
      try {
        const existing = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' });
        setCatalog(existing.catalog); setCatalogSha(existing.sha);
        setNotice('GitHub test kataloğu zaten mevcut; yeniden oluşturulmadı.');
        return;
      } catch (error) { if (!String(error.message).includes('HTTP 404')) throw error; }
      await saveCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main',
        catalog: CODE_REPO_CATALOG, sha: null });
      const saved = await fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' });
      setCatalog(saved.catalog); setCatalogSha(saved.sha); setCatalogAdmin(true);
      setNotice('LED test kataloğu GitHub deposuna eklendi. Kaynak sürümünü yenileyip indir.');
      await refreshSource();
    } catch (error) { setNotice(`Test kataloğu kurulamadı: ${error.message}`); }
  };

  const runHardwareTest = async () => {
    if (testBusy || !selectedTest || testBlocker) return;
    const requestId = crypto.randomUUID();
    setConfirmLedFlash(false); setVisualPending(null); setTestBusy(true); setDiagnosticReport(null);
    try {
      const profileJson = JSON.stringify(profile);
      setTestStage(`${selectedTest.name} GitHub kaynağından bilgisayarda derleniyor…`);
      const built = await invoke('compile_code_test', { request: { repository: githubConfig.repository, testId: selectedTest.id,
        profileJson, componentRef: activeSensor.ref, requestId, mcuPart: profile.mcu.part, targetUid: target.uid } });
      const firmwareBytes = Uint8Array.from(built.bytes);
      if (await sha256Hex(new Blob([firmwareBytes])) !== built.sha256) throw new Error('Derlenen BIN özeti uyuşmuyor.');
      if (firmwareBytes.length > target.flashSizeKb * 1024) throw new Error('BIN hedef flash kapasitesini aşıyor.');
      const live = await espJson(normalizedBridge, '/api/target/status', { timeoutMs: 6000 });
      if (!live.connected || live.uid !== target.uid || live.uid !== profile.targetUid || !live.model?.startsWith(profile.mcu.family)) {
        throw new Error('Canlı STM32 hedefi profille uyuşmuyor; flash yapılmadı.');
      }
      const expectedDeviceId = profile.mcu.part.startsWith('STM32F401CC') ? '0x423'
        : profile.mcu.part.startsWith('STM32F401C') ? '0x433'
        : profile.mcu.part.startsWith('STM32F446RE') ? '0x421' : null;
      if (expectedDeviceId && live.deviceId?.toLowerCase() !== expectedDeviceId) {
        throw new Error(`STM32 varyantı uyuşmuyor: ${expectedDeviceId} beklenirken ${live.deviceId || 'bilinmiyor'} okundu.`);
      }
      setTestStage('ESP32 üzerinden STM32’ye yükleniyor…');
      const file = new File([firmwareBytes], `stardrop-${selectedTest.id}.bin`, { type: 'application/octet-stream' });
      if (!await flashFirmware(file)) throw new Error('ESP32 flash işlemi başarısız.');
      if (selectedTest.result === 'sram') {
        setTestStage('STM32 test raporu okunuyor…');
        const report = await waitForDiagnosticReport({
          test: hash32FromSha256(await sha256Hex(selectedTest.id)),
          profile: hash32FromSha256(await sha256Hex(profileJson)),
          run: hash32FromSha256(await sha256Hex(requestId)),
        });
        setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
          testId: selectedTest.id, targetUid: live.uid, status: report.state, sourceSha: built.sourceSha,
          firmwareSha256: built.sha256, report }]);
        setTestStage(`STM32 test raporu: ${report.state}.`);
        return;
      }
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
        testId: selectedTest.id, targetUid: live.uid, status: 'PENDING_VISUAL', sourceSha: built.sourceSha,
        firmwareSha256: built.sha256, pin: profile.connections.find((item) => item.componentRef === activeSensor.ref)?.mcuPin,
        blinkMs: activeSensor.blinkMs, confirmation: 'VISUAL_REQUIRED' }]);
      setVisualPending(requestId);
      setTestStage('GitHub test firmware’i yüklendi. Sonucu gözle kontrol et.');
    } catch (error) {
      setTestStage(`${selectedTest.name} durdu: ${error.message}`);
      setNotice(`Donanım testi başarısız: ${error.message}`);
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
        testId: selectedTest.id, status: 'ERROR', error: error.message }]);
    } finally { setTestBusy(false); }
  };

  const finishVisualTest = (passed) => {
    if (!visualPending) return;
    setTestHistory((items) => items.map((item) => item.requestId === visualPending && item.status === 'PENDING_VISUAL'
      ? { ...item, status: passed ? 'PASS' : 'FAIL', confirmedAt: new Date().toISOString(), confirmation: 'VISUAL' } : item));
    setVisualPending(null);
    setTestStage(passed ? 'LED gözlemi başarılı olarak kaydedildi.' : 'LED gözlemi başarısız olarak kaydedildi.');
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
      return true;
    } catch (error) { setNotice(`Proje açılamadı: ${error.message}`); return false; }
  };

  const refreshLibrary = async () => {
    setLibraryBusy(true); setLibraryError('');
    try {
      const token = await validRepoToken();
      if (!token) throw new Error('GitHub oturumu veya depo anahtarı gerekli.');
      const entries = await listLibraryEntries({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' });
      setLibraryEntries(entries.filter(validateLibraryEntry).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
    } catch (error) { setLibraryError(`Test kütüphanesi okunamadı: ${error.message}`); }
    finally { setLibraryBusy(false); }
  };

  const publishLibrary = async ({ name, note }) => {
    setLibraryBusy(true); setLibraryError('');
    try {
      const entry = makeLibraryEntry({ name, note, profile, componentRef: activeComponent,
        test: selectedTest, history: testHistory, author: githubUser?.login, sourceSha: sourceStatus?.activeSha });
      const token = await validRepoToken();
      if (!token) throw new Error('GitHub oturumu veya depo anahtarı gerekli.');
      await publishLibraryEntry({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', entry });
      setLibraryEntries((items) => [entry, ...items]);
      setNotice(`${entry.name} GitHub Test Kütüphanesi’ne kaydedildi.`);
      return entry;
    } catch (error) { setLibraryError(`Yayınlanamadı: ${error.message}`); return null; }
    finally { setLibraryBusy(false); }
  };

  const openLibraryEntry = (entry) => {
    if (!validateLibraryEntry(entry) || !validateBoardProfile(entry.profile).valid) {
      setLibraryError('Kayıt profili geçersiz; güvenle açılamıyor.'); return;
    }
    const restored = JSON.parse(JSON.stringify(entry.profile));
    restored.targetUid = null;
    restored.connections = restored.connections.map((connection) => ({ ...connection, approved: false }));
    setProfile(restored); setActiveComponent(entry.component.ref); setSelectedTestId(entry.test.id || '');
    setTestHistory([]); setSources({ netlist: null, schematic: null, bom: null, boardImage: null }); setAnalysis(null);
    setAdvancedWorkbench(false); setMode('workbench');
    setNotice(`${entry.name} açıldı. Canlı hedefi eşleştirip pinleri yeniden onayla.`);
  };

  const components = profile?.components || [];
  const componentConnections = profile?.connections.filter((item) => item.componentRef === activeComponent) || [];

  if (session === 'welcome') return <div className="welcome-screen"><aside className="welcome-sidebar"><div className="brand"><BrandMark/><div><strong>STARDROP</strong><small>Remote Code Flash and Test Platform</small></div></div><span>YILDIZ ROKET TAKIMI</span></aside><main className="welcome-content"><span className="eyebrow">BAŞLANGIÇ</span><h1>Çalışma alanı</h1><p>Nasıl devam etmek istersin?</p><div className="welcome-actions"><button className="welcome-primary" disabled={githubLoginBusy} onClick={() => { if (githubUser) { setSession('github'); setMode('workbench'); } else startGithubLogin(); }}><Github size={18} /><span><strong>{githubUser ? `@${githubUser.login} ile devam et` : githubLoginBusy ? 'GitHub girişi bekleniyor…' : 'GitHub ile devam et'}</strong><small>Kart analizi ve yerel LED testi</small></span><b>→</b></button><button className="welcome-guest" onClick={() => { setSession('guest'); setMode('flash'); }}><Upload size={18} /><span><strong>Misafir olarak gir</strong><small>ESP32 üzerinden firmware yükle</small></span><b>→</b></button></div>{githubLoginBusy && !deviceLogin && <div className="welcome-auth-feedback" role="status">GitHub doğrulama kodu hazırlanıyor…</div>}{githubLoginError && <div className="welcome-auth-error" role="alert"><strong>GitHub girişi tamamlanamadı</strong><span>{githubLoginError}</span><small>GitHub App ayarlarında Device Flow açık olmalı. Cloudflare Worker veya callback gerekmiyor.</small></div>}<div className="welcome-status">{notice}</div></main><DeviceLogin challenge={deviceLogin} onOpen={() => invoke('github_device_open')} onCancel={cancelGithubLogin} /></div>;

  if (session === 'guest') return <div className="guest-layout"><header className="guest-header"><div className="brand"><BrandMark/><strong>STARDROP</strong></div><div className="guest-header-actions"><EspStatus esp={esp} onRetry={autoConnect} disabled={flashBusy}/><button onClick={() => setSession('welcome')}>Girişe dön</button></div></header><EspConsole bridge={bridge} setBridge={setBridge} espBase={activeBridge} devices={discoveredDevices} onConnect={connectBridge} onDiscover={autoConnect} target={target} notice={notice} refreshTarget={refreshTarget} firmware={firmware} setFirmware={setFirmware} flashFirmware={flashFirmware} flashLog={flashLog} flashProgress={flashProgress} flashBusy={flashBusy} setNotice={setNotice} /></div>;

  return <div className="app-shell">
    <aside className="rail">
      <div className="brand"><BrandMark/><div><strong>STARDROP</strong><small>Remote Code Flash and Test Platform</small></div></div>
      <nav>
        <button className={mode === 'flash' ? 'active' : ''} onClick={() => setMode('flash')}><Upload />Hızlı Yükleme</button>
        {session === 'github' && githubUser && <button className={mode === 'workbench' ? 'active' : ''} onClick={() => { setAdvancedWorkbench(false); setMode('workbench'); }}><FlaskConical />Yeni Test</button>}
        {session === 'github' && githubUser && <button className={mode === 'library' ? 'active' : ''} onClick={() => { setMode('library'); refreshLibrary(); }}><BookOpen />Test Kütüphanesi</button>}
        {session === 'github' && githubUser && catalogAdmin && <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}><ShieldCheck />Test Yönetimi</button>}
        {session === 'github' && githubUser && <button className={`rail-settings ${mode === 'settings' ? 'active' : ''}`} onClick={() => setMode('settings')}><Settings />Ayarlar</button>}
      </nav>
      <div className="rail-footer"><div className="rail-account">{githubUser?.avatar_url && <img className="rail-avatar" src={githubUser.avatar_url} alt="" referrerPolicy="no-referrer" />}<div><span>{session === 'github' && githubUser ? `@${githubUser.login}` : 'MİSAFİR OTURUMU'}</span><div className="rail-account-actions"><button onClick={() => setSession('welcome')}>Girişe dön</button><button onClick={logoutGithub} disabled={githubLogoutBusy}>{githubLogoutBusy ? 'Çıkılıyor…' : 'Çıkış yap'}</button></div></div></div></div><div className="rail-status"><span className="status-dot" /><span>{notice}</span></div>
    </aside>
    <main>
      <header><div><h1>{mode === 'flash' ? 'PROGRAMLAYICI' : mode === 'settings' ? 'AYARLAR' : mode === 'admin' ? 'TEST YÖNETİMİ' : mode === 'library' ? 'TEST KÜTÜPHANESİ' : 'YENİ TEST'}</h1><p>{mode === 'flash' ? 'ESP32 / STM32 · iki sinyal hattı' : mode === 'library' ? 'Ekibin paylaştığı kart ve test düzenleri' : 'Kart profilleri ve sensör tanı iş akışı'}</p></div><EspStatus esp={esp} onRetry={autoConnect} disabled={flashBusy}/></header>
      {mode === 'settings' && <div className="repo-diagnostic"><button className="secondary" onClick={runRepoDiagnostic} disabled={repoDiagnosticBusy}>{repoDiagnosticBusy ? 'ERİŞİM SINANIYOR…' : 'GITHUB ERİŞİMİNİ TEST ET'}</button>{repoDiagnostic && <span>{repoDiagnostic.error || `${repoDiagnostic.credentialSource} · ${repoDiagnostic.tokenFormat} (${repoDiagnostic.tokenLength} karakter) · Hesap ${repoDiagnostic.userStatus} · Depo ${repoDiagnostic.repositoryStatus} · Katalog ${repoDiagnostic.catalogStatus}`}</span>}</div>}
      {mode === 'settings' && githubUser && !catalogSha && <div className="catalog-setup"><span>Bu depoda henüz STARDROP test kataloğu okunamadı. Depoya ilk kez kurmak için yalnız bu repoda <b>Contents: Read and write</b> izni gerekir.</span><button className="secondary" onClick={installTestCatalog}>LED KATALOĞUNU KUR</button></div>}
      {mode === 'library' ? <TestLibrary entries={libraryEntries} busy={libraryBusy} error={libraryError} refresh={refreshLibrary} publish={publishLibrary} profile={profile} activeSensor={activeSensor} selectedTest={selectedTest} openEntry={openLibraryEntry} sourceSha={sourceStatus?.activeSha} /> : mode === 'admin' ? <div className="workspace settings-page"><Section title="SENSÖR → TEST KAYNAĞI" action={<Badge tone={catalogAdmin ? 'good' : 'bad'}>{catalogAdmin ? 'YAZMA YETKİSİ VAR' : 'YETKİ YOK'}</Badge>}><p>Test listesi GitHub kataloğundan gelir. Şu an yerel derleyici LED için hazır; yeni testlerin kaynakları ve derleyicisi doğrulanmadan “hazır” yapılmamalı.</p><div className="admin-grid"><SelectMenu ariaLabel="Yönetilecek test" value={adminTestId} options={catalog.tests.map((item) => ({ value: item.id, label: item.name }))} onChange={setAdminTestId}/><input value={adminTest?.sourcePath || ''} placeholder="tests/bmp180/stardrop-project.json" onChange={(event) => updateAdminTest('sourcePath', event.target.value)} /><input value={adminTest?.matchParts?.join(', ') || ''} placeholder="BMP180, BMP085" onChange={(event) => updateAdminTest('matchParts', event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></div><p>Pinler kart profilinden derleme sırasında üretilir.</p><button className="primary settings-login" disabled={!catalogAdmin || catalogLoading} onClick={saveAdminCatalog}><Save />GITHUB KATALOĞUNA KAYDET</button></Section></div> : mode === 'settings' ? <div className="workspace settings-page"><Section title="GITHUB TEST DEPOSU" action={githubUser ? <Badge tone="good">@{githubUser.login}</Badge> : <Badge tone="warn">GİRİŞ YOK</Badge>}><p>Hızlı Yükleme giriş gerektirmez. Test kodları bu depodan indirilir ve bilgisayarında derlenir.</p><div className="settings-grid"><input value={githubConfig.repository || ''} placeholder="owner/repo" onChange={(event) => updateGithubConfig('repository', event.target.value)} /><input value={githubConfig.ref || ''} placeholder="main" onChange={(event) => updateGithubConfig('ref', event.target.value)} /></div><button className="primary settings-login" disabled={githubLoginBusy || Boolean(githubUser)} onClick={startGithubLogin}><Github />{githubUser ? `GİRİŞ YAPILDI: ${githubUser.login}` : githubLoginBusy ? 'GİRİŞ BEKLENİYOR…' : 'GITHUB İLE GİRİŞ YAP'}</button><p>Özel depo için GitHub girişinin erişimi yoksa yalnız bu repoya “Contents: Read” veren fine-grained token kullanabilirsin. Tokeni sohbet yerine buraya gir; işletim sisteminin güvenli deposunda tutulur.</p><div className="settings-grid"><input type="password" autoComplete="off" value={repoToken} placeholder={repoTokenSaved ? 'Depo anahtarı kayıtlı' : 'Fine-grained repo token'} onChange={(event) => setRepoToken(event.target.value)} /><button className="secondary" onClick={saveRepoAccess} disabled={!repoToken.trim()}>ANAHTARI KAYDET</button></div>{repoTokenSaved && <button className="secondary" onClick={removeRepoAccess}>KAYITLI ANAHTARI SİL</button>}</Section><Section title="GÜVENLİK DURUMU"><div className="security-list"><span><ShieldCheck />AI anahtarı: {secretStorageMode === 'memory' ? 'bu oturumun belleği' : 'OS credential store'}</span><span><ShieldCheck />GitHub token: {secretStorageMode === 'memory' ? 'bu oturumun belleği' : 'OS credential store'}</span><span><ShieldCheck />.stardrop export: anahtar ve token içermez</span></div></Section></div> : mode === 'flash' ? <EspConsole bridge={bridge} setBridge={setBridge} espBase={activeBridge} devices={discoveredDevices} onConnect={connectBridge} onDiscover={autoConnect} target={target} notice={notice} refreshTarget={refreshTarget} flashFirmware={flashFirmware} firmware={firmware} setFirmware={setFirmware} flashLog={flashLog} flashProgress={flashProgress} visualPending={visualPending} setTestStage={setTestStage} setFlashLog={setFlashLog} flashBusy={flashBusy} setNotice={setNotice} /> : <WorkbenchWizard profile={profile} setProfile={setProfile} sources={sources} catalog={catalog} githubConfig={githubConfig} sourceStatus={sourceStatus} sourceError={sourceError} sourceBusy={sourceBusy} refreshSource={refreshSource} activateSource={activateSource} target={target} esp={esp} activeSensor={activeSensor} activeComponent={activeComponent} setActiveComponent={setActiveComponent} editConnection={editConnection} approveComponent={approveComponent} updateLedSetting={updateLedSetting} compatibleTests={compatibleTests} selectedTest={selectedTest} setSelectedTestId={setSelectedTestId} testBlocker={testBlocker} testBusy={testBusy} testStage={testStage} flashBusy={flashBusy} flashLog={flashLog} flashProgress={flashProgress} visualPending={visualPending} finishVisualTest={finishVisualTest} setConfirmLedFlash={setConfirmLedFlash} loadNetlist={loadNetlist} importProject={importProject} exportProject={exportProject} setAnalysis={setAnalysis} setSources={setSources} bindTarget={() => setProfile((current) => addAuditEvent({ ...current, targetUid: target.uid }, 'TARGET_UID_BOUND', { uid: target.uid }))} refreshTarget={refreshTarget} setFlashLog={setFlashLog} setTestStage={setTestStage} setNotice={setNotice} aiConfig={aiConfig} updateAiConfig={updateAiConfig} aiKey={aiKey} setAiKey={setAiKey} aiBusy={aiBusy} runAiReview={runAiReview} aiReview={aiReview} acceptedSuggestions={acceptedSuggestions} setAcceptedSuggestions={setAcceptedSuggestions} applySelectedAiSuggestions={applySelectedAiSuggestions} diagnosticReport={diagnosticReport} testHistory={testHistory} />}
    </main>
    {confirmLedFlash && <div className="confirm-overlay" role="presentation"><div className="confirm-card" role="dialog" aria-modal="true" aria-labelledby="led-confirm-title"><h2 id="led-confirm-title">STM32 yazılımı değişecek</h2><p>{selectedTest?.name || 'Donanım testi'} için mevcut firmware silinip yerel derlenen kod yüklenecek. Hedef: {target?.model || 'bilinmiyor'} · {target?.uid || 'UID yok'}</p><div><button className="secondary" onClick={() => setConfirmLedFlash(false)}>VAZGEÇ</button><button className="primary" onClick={runHardwareTest}>DERLE VE YÜKLE</button></div></div></div>}
    <DeviceLogin challenge={deviceLogin} onOpen={() => invoke('github_device_open')} onCancel={cancelGithubLogin} />
  </div>;
}
