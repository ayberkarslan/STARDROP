import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BookOpen, Cpu, FlaskConical, Github, Save, Settings, ShieldCheck, Upload } from 'lucide-react';
import { deleteSecret, loadSecret, saveSecret } from './lib/secretStore.js';
import { clearGitHubSession, saveGitHubSession, validGitHubToken } from './lib/githubAuth.js';
import { catalogWritePermission, currentGitHubUser, fetchCatalogDocument, fetchLibraryProject, listLibraryEntries, publishLibraryEntry, saveCatalogDocument } from './lib/githubClient.js';
import TestLibrary from './TestLibrary.jsx';
import SelectMenu from './SelectMenu.jsx';
import DeviceLogin from './DeviceLogin.jsx';
import NotificationCenter, { useNoticeHistory } from './NotificationCenter.jsx';
import WorkspaceTabs, { useWorkspaceTabs } from './WorkspaceTabs.jsx';
import WelcomeStars from './WelcomeStars.jsx';
import { workspaceLabels } from './lib/workspaceTabs.js';
import { validateBoardProfile } from './lib/boardProfile.js';
import { libraryReadme, makeLibraryEntry, validateLibraryEntry } from './lib/testLibrary.js';
import { exportStardropProject, importStardropProject } from './lib/projectArchive.js';
import { createHardwareGate } from './lib/hardwareGate.js';
import TestSession from './TestSession.jsx';
import FlashSession from './FlashSession.jsx';
import useWorkspaceDrag from './useWorkspaceDrag.js';
import DragPreview from './DragPreview.jsx';
import { discoveryCandidates, discoverEspDevices, normalizeEspAddress, probeEsp } from './lib/espConnection.js';
import { espJson } from './lib/espTransport.js';
import { watchEspStatus } from './lib/espStatusEvents.js';
import { namedTarget } from './lib/targetRegistry.js';
import useTargetRegistry from './useTargetRegistry.js';
import { validateTestCatalog } from './lib/testCatalog.js';
import CODE_REPO_CATALOG from '../../code-repo/catalog/catalog.json' with { type: 'json' };

const savedBridge = localStorage.getItem('stardrop.bridge') || 'http://192.168.4.1';

function Badge({ children, tone = 'muted' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function Section({ title, children, action }) {
  return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

function StartContent({ user, busy, onGithub, onGuest, error, preparing }) {
  return <div className="start-content">
    <span className="start-wordmark">STARDROP</span>
    <span className="eyebrow">BAŞLANGIÇ</span><h1>Çalışma alanı</h1><p>Nasıl devam etmek istersin?</p>
    <div className="welcome-actions">
      <button className="welcome-primary" disabled={busy} onClick={onGithub}><Github size={18}/><span><strong>{user ? `@${user.login} ile devam et` : busy ? 'GitHub girişi bekleniyor…' : 'GitHub ile devam et'}</strong><small>Kart analizi ve yerel LED testi</small></span><b>→</b></button>
      <button className="welcome-guest" onClick={onGuest}><Upload size={18}/><span><strong>Misafir olarak gir</strong><small>ESP32 üzerinden firmware yükle</small></span><b>→</b></button>
    </div>
    {preparing && <div className="welcome-auth-feedback" role="status">GitHub doğrulama kodu hazırlanıyor…</div>}
    {error && <div className="welcome-auth-error" role="alert"><strong>GitHub girişi tamamlanamadı</strong><span>{error}</span><small>GitHub App ayarlarında Device Flow açık olmalı. Cloudflare Worker veya callback gerekmiyor.</small></div>}
  </div>;
}

function EmptyWorkspace({ children }) {
  return <div className="workspace-empty" data-drop-empty="true" role="tabpanel" aria-label="Boş çalışma alanı"><div className="empty-start-content">{children}</div></div>;
}

function RailTool({ tool, Icon, workspace, drag, onOpen }) {
  return <button className={(tool === 'settings' ? 'rail-settings ' : '') + (workspace.mode === tool ? 'active' : '')}
    data-rail-tool={tool} onPointerDown={(event) => drag.start(event, { kind: 'tool', tool, label: workspaceLabels[tool] })}
    onClick={() => { if (drag.suppressClick.current) return; workspace.open(tool); onOpen?.(); }}>
    <Icon/>{workspaceLabels[tool]}
  </button>;
}

export default function App() {
  const [session, setSession] = useState('welcome');
  useEffect(() => { document.dispatchEvent(new Event('stardrop-tab-change')); }, [session]);
  const workspace = useWorkspaceTabs();
  const guestWorkspace = useWorkspaceTabs('guest');
  const { mode, open: setMode } = workspace;
  const [hardwareBusy, setHardwareBusy] = useState(null);
  const hardwareRef = useRef(null);
  if (!hardwareRef.current) hardwareRef.current = createHardwareGate(setHardwareBusy);
  const hardware = hardwareRef.current;
  const [testDrafts, setTestDrafts] = useState({});
  const onDraftChange = useCallback((id, draft) => setTestDrafts((current) => ({ ...current, [id]: draft })), []);
  const lockedIds = hardwareBusy ? [hardwareBusy.ownerId] : [];
  const drag = useWorkspaceDrag({ workspace, lockedIds, setNotice: (message) => setNotice(message) });
  const guestDrag = useWorkspaceDrag({ workspace: guestWorkspace, lockedIds, setNotice: (message) => setNotice(message) });
  const [bridge, setBridge] = useState(savedBridge);
  const [activeBridge, setActiveBridge] = useState(null);
  const [esp, setEsp] = useState({ status: 'searching', wifi: null, base: null });
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const discoveryRun = useRef(0);
  const healthMisses = useRef(0);
  const [rawTarget, setTarget] = useState(null);
  const [notice, setNotice] = useState('ESP32 programlayıcı bekleniyor.');
  const { records: targetRecords, saveTargetName } = useTargetRegistry(rawTarget, setNotice);
  const target = namedTarget(rawTarget, targetRecords);
  const noticeHistory = useNoticeHistory(notice);
  const [libraryEntries, setLibraryEntries] = useState([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [sourceStatus, setSourceStatus] = useState(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [aiConfig, setAiConfig] = useState(() => JSON.parse(localStorage.getItem('stardrop.ai.config') || '{"endpoint":"https://api.openai.com/v1","model":"gpt-4.1-mini"}'));
  const [aiKey, setAiKey] = useState('');
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
    if (hardware.current) { setNotice('Donanım işlemi sürerken ESP bağlantısı değiştirilemez.'); return; }
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
      const capabilities = await espJson(result.base, '/api/programmer/status');
      if (run !== discoveryRun.current) return;
      setEsp(current => ({ ...current, programmer: capabilities, statusEvents: capabilities.statusEventsAvailable === true }));
      if (!capabilities.statusEventsAvailable) await refreshTargetAt(result.base);
    } catch (error) {
      if (run !== discoveryRun.current) return;
      setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
      setNotice(`ESP32’ye erişilemedi: ${error.message}`);
    }
  };

  const autoConnect = async () => {
    if (hardware.current) return;
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
        const capabilities = await espJson(result.base, '/api/programmer/status');
        if (run !== discoveryRun.current) return;
        setEsp(current => ({ ...current, programmer: capabilities, statusEvents: capabilities.statusEventsAvailable === true }));
        if (!capabilities.statusEventsAvailable) await refreshTargetAt(result.base);
        return;
      } catch (_) { /* Sonraki adresi dene. */ }
    }
    if (run !== discoveryRun.current) return;
    setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
    setNotice('ESP32 bulunamadı. PC ile ESP aynı ağa bağlı mı?');
  };

  const refreshTarget = () => {
    if (hardware.current) { setNotice('Donanım işlemi sürüyor; hedef daha sonra yenilenecek.'); return; }
    try {
      const typed = normalizeEspAddress(bridge);
      if (typed !== activeBridge) return connectBridge(typed);
    } catch (_) { return connectBridge(bridge); }
    return esp.status === 'online' && activeBridge ? refreshTargetAt(activeBridge) : autoConnect();
  };

  useEffect(() => { autoConnect(); return () => { discoveryRun.current++; }; }, []);
  const canWatchStatus = esp.statusEvents && Boolean(window.__TAURI_INTERNALS__);
  useEffect(() => {
    if (!canWatchStatus || esp.status !== 'online' || hardwareBusy) return;
    let cancelled = false; let stop;
    const watchError = error => {
      if (cancelled) return;
      setEsp(current => ({ ...current, statusEvents: false }));
      setNotice(`Cihaz bildirimleri alınamadı: ${String(error)}`);
    };
    watchEspStatus(esp.base, event => {
      if (cancelled || hardware.current) return;
      if (event.status === 'offline') {
        setEsp(current => ({ ...current, status: 'offline', wifi: null })); setTarget(null);
        setNotice('ESP32 bağlantısı kesildi; yeniden aranıyor.');
        return;
      }
      setEsp(current => ({ ...current, wifi: { ...current.wifi, ...event.wifi } }));
      setTarget(event.target);
    }, watchError).then(cleanup => { if (cancelled) cleanup(); else stop = cleanup; }).catch(watchError);
    return () => { cancelled = true; stop?.(); };
  }, [canWatchStatus, esp.status, esp.base, hardwareBusy]);
  useEffect(() => {
    if (hardwareBusy || esp.status === 'searching' || canWatchStatus && esp.status === 'online') return;
    let pending = false; let cancelled = false;
    const timer = window.setInterval(async () => {
      if (hardware.current || pending) return;
      if (esp.status !== 'online') { autoConnect(); return; }
      pending = true;
      try {
        const live = await probeEsp(esp.base, 4000);
        if (cancelled) return;
        healthMisses.current = 0;
        setEsp(current => ({ ...current, status: 'online', ...live }));
        // Legacy firmware gets network health checks only, never automatic SWD/reset probes.
      } catch (_) {
        if (cancelled) return;
        if (++healthMisses.current >= 2) {
          setEsp({ status: 'offline', wifi: null, base: null }); setTarget(null);
          setNotice('ESP32 bağlantısı kesildi; yeniden aranıyor.');
        }
      } finally { pending = false; }
    }, esp.status === 'online' ? 10000 : 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [esp.status, esp.base, hardwareBusy, canWatchStatus]);

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
    if (hardwareRef.current.current) { setNotice('Donanım işlemi bitmeden kod kaynağı değiştirilemez.'); return false; }
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

  const updateAiConfig = (field, value) => setAiConfig((current) => {
    const next = { ...current, [field]: value };
    localStorage.setItem('stardrop.ai.config', JSON.stringify(next));
    return next;
  });

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
    if (hardware.current) { setNotice('Donanım işlemi bitmeden çıkış yapılamaz.'); return; }
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
      workspace.reset(); guestWorkspace.reset(); setTestDrafts({});
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

  const refreshLibrary = async () => {
    setLibraryBusy(true); setLibraryError('');
    try {
      const token = await validRepoToken();
      if (!token) throw new Error('GitHub oturumu veya depo anahtarı gerekli.');
      const [entries, remote] = await Promise.all([
        listLibraryEntries({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' }),
        fetchCatalogDocument({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main' }),
      ]);
      const validation = validateTestCatalog(remote.catalog);
      if (!validation.valid) throw new Error(validation.errors.join('; '));
      setCatalog(remote.catalog); setCatalogSha(remote.sha);
      setLibraryEntries(entries.filter(validateLibraryEntry).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
    } catch (error) { setLibraryError(`Test kütüphanesi okunamadı: ${error.message}`); }
    finally { setLibraryBusy(false); }
  };

  const libraryPublishLock = useRef(false);
  const publishLibrary = async ({ name, note, documentId }) => {
    if (libraryPublishLock.current) { setNotice('Başka bir kütüphane kaydı yayınlanıyor; bitmesini bekle.'); return null; }
    const draft = testDrafts[documentId];
    if (!draft?.profile || !draft.activeComponent) { setLibraryError('Önce paylaşılacak test çalışmasını seç.'); return null; }
    libraryPublishLock.current = true;
    setLibraryBusy(true); setLibraryError('');
    try {
      const entry = makeLibraryEntry({ name, note, profile: { ...draft.profile,
        targetLabel: draft.profile.targetUid === target?.uid ? target.label || draft.profile.targetLabel : draft.profile.targetLabel }, componentRef: draft.activeComponent,
        test: draft.selectedTest, history: draft.testHistory, author: githubUser?.login, sourceSha: sourceStatus?.activeSha });
      entry.projectArchive = true;
      const token = await validRepoToken();
      if (!token) throw new Error('GitHub oturumu veya depo anahtarı gerekli.');
      const project = await exportStardropProject({ profile: entry.profile, netlist: draft.sources?.netlist,
        bom: draft.sources?.bom, schematicPdf: draft.sources?.schematic, boardImage: draft.sources?.boardImage,
        artifacts: [{ name: 'test.json', data: JSON.stringify(entry) }],
        testHistory: (draft.testHistory || []).map(({ targetUid, ...run }) => run) });
      await publishLibraryEntry({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', entry,
        project, readme: libraryReadme(entry) });
      setLibraryEntries((items) => [entry, ...items]);
      setNotice(entry.name + ' GitHub Test Kütüphanesi’ne kaydedildi.');
      return entry;
    } catch (error) { setLibraryError('Yayınlanamadı: ' + error.message); return null; }
    finally { libraryPublishLock.current = false; setLibraryBusy(false); }
  };

  const openLibraryEntry = async (entry) => {
    if (entry.kind === 'template') {
      const test = catalog.tests.find(item => item.id === entry.test.id && item.status === 'ready');
      if (!test) { setLibraryError('Test kodu artık katalogda hazır değil. Listeyi yenile.'); return; }
      workspace.open('workbench', { fresh: true, data: { testId: test.id, catalogPreset: {
        part: entry.component.part, protocol: test.protocol, supportedMcu: test.supportedMcu,
      } } });
      return;
    }
    if (!validateLibraryEntry(entry) || !validateBoardProfile(entry.profile).valid) {
      setLibraryError('Kayıt profili geçersiz; güvenle açılamıyor.'); return;
    }
    const profile = JSON.parse(JSON.stringify(entry.profile));
    let restored = {};
    if (entry.projectArchive) {
      setLibraryBusy(true);
      try {
        const token = await validRepoToken();
        const bytes = await fetchLibraryProject({ token, repository: githubConfig.repository, ref: githubConfig.ref || 'main', entryId: entry.id });
        const imported = await importStardropProject(bytes);
        if (!imported.validation.valid || imported.profile.id !== profile.id) throw new Error('Proje ile kayıt eşleşmiyor.');
        const image = Object.entries(imported.sources).find(([path]) => path.startsWith('sources/board-image.'));
        const imageType = image?.[0].endsWith('.png') ? 'image/png' : image?.[0].endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        restored = { sources: { netlist: imported.sources['sources/board.NET'] ? await imported.sources['sources/board.NET'].text() : null,
          bom: imported.sources['sources/bom.csv'] ? await imported.sources['sources/bom.csv'].text() : null,
          schematic: imported.sources['sources/schematic.pdf'] || null,
          boardImage: image ? new File([image[1]], image[0].split('/').at(-1), { type: imageType }) : null },
          testHistory: imported.testHistory };
      } catch (error) { setLibraryError(`Proje açılamadı: ${error.message}`); return; }
      finally { setLibraryBusy(false); }
    }
    profile.targetUid = null;
    profile.connections = profile.connections.map((connection) => ({ ...connection, approved: false }));
    workspace.open('workbench', { fresh: true, data: { ...restored, profile, componentRef: entry.component.ref, testId: entry.test.id || '' } });
    setNotice(entry.name + ' ayrı test sekmesinde açıldı. Canlı hedefi eşleştirip pinleri yeniden onayla.');
  };

  const services = { session, githubUser, esp, target, catalog, githubConfig, sourceStatus, sourceError, sourceBusy,
    shareTest: documentId => workspace.open('library', { fresh: true, data: { draftId: documentId } }),
    refreshSource, activateSource, activeBridge, bridge, setBridge, refreshTarget, refreshTargetAt, saveTargetName, setNotice,
    aiConfig, updateAiConfig, aiKey, setAiKey, hardware, hardwareBusy,
    espBase: activeBridge, devices: discoveredDevices, onConnect: connectBridge, onDiscover: autoConnect, notice };
  const titles = Object.fromEntries(Object.entries(testDrafts).filter(([, draft]) => draft.profile).map(([id, draft]) => [id, draft.profile.name + ' · ' + (draft.selectedTest?.name || 'Yeni Test')]));
  const renderDocument = (doc, activeId, currentWorkspace) => {
    const mode = doc.type;
    const tab = currentWorkspace.state.tabs.find((item) => item.documentId === doc.id);
    const visible = tab?.id === activeId;
    const preview = currentWorkspace === guestWorkspace ? guestDrag.preview : drag.preview;
    if (mode === 'empty') return null;
    return <section className={'workspace-panel' + (preview?.overId === tab?.id ? ' panel-drop-target' : '')} key={doc.id}
      id={'panel-' + doc.id} role="tabpanel" aria-label={titles[doc.id] || workspaceLabels[mode]} hidden={!visible} data-drop-document={doc.id}>
      {mode === 'settings' && <div className="repo-diagnostic"><button className="secondary" onClick={runRepoDiagnostic} disabled={repoDiagnosticBusy}>{repoDiagnosticBusy ? 'ERİŞİM SINANIYOR…' : 'GITHUB ERİŞİMİNİ TEST ET'}</button>{repoDiagnostic && <span>{repoDiagnostic.error || `${repoDiagnostic.credentialSource} · ${repoDiagnostic.tokenFormat} (${repoDiagnostic.tokenLength} karakter) · Hesap ${repoDiagnostic.userStatus} · Depo ${repoDiagnostic.repositoryStatus} · Katalog ${repoDiagnostic.catalogStatus}`}</span>}</div>}
      {mode === 'settings' && repoDiagnostic?.repositoryStatus === 404 && <p className="repo-help">Hesap tanınsa bile özel depo bu kimlikle görünmüyor. GitHub App’i bu depoya Contents izniyle kur veya yalnız bu depoya erişen fine-grained token kaydet. App iznini değiştirirsen yeniden giriş yap.</p>}
      {mode === 'settings' && githubUser && !catalogSha && <div className="catalog-setup"><span>Bu depoda henüz STARDROP test kataloğu okunamadı. Depoya ilk kez kurmak için yalnız bu repoda <b>Contents: Read and write</b> izni gerekir.</span><button className="secondary" onClick={installTestCatalog}>LED KATALOĞUNU KUR</button></div>}
      {mode === 'devices' ? <FlashSession documentId={doc.id} services={services} devicesOnly/> : mode === 'flash' ? <FlashSession documentId={doc.id} services={services}/> :
        mode === 'workbench' ? <TestSession documentId={doc.id} initialData={doc.initialData} services={services} onDraftChange={onDraftChange}/> :
        mode === 'library' ? <TestLibrary initialDraftId={doc.initialData?.draftId} entries={libraryEntries} catalog={catalog} busy={libraryBusy} error={libraryError} refresh={refreshLibrary} publish={publishLibrary}
          drafts={testDrafts} documents={workspace.state.documents} openEntry={openLibraryEntry} sourceSha={sourceStatus?.activeSha}
          startNewTest={() => workspace.open('workbench', { fresh: true })}/> :
        mode === 'admin' ? (catalogAdmin ? <div className="workspace settings-page"><Section title="SENSÖR → TEST KAYNAĞI" action={<Badge tone={catalogAdmin ? 'good' : 'bad'}>{catalogAdmin ? 'YAZMA YETKİSİ VAR' : 'YETKİ YOK'}</Badge>}><p>Test listesi GitHub kataloğundan gelir. Şu an yerel derleyici LED için hazır; yeni testlerin kaynakları ve derleyicisi doğrulanmadan “hazır” yapılmamalı.</p><div className="admin-grid"><SelectMenu ariaLabel="Yönetilecek test" value={adminTestId} options={catalog.tests.map((item) => ({ value: item.id, label: item.name }))} onChange={setAdminTestId}/><input value={adminTest?.sourcePath || ''} placeholder="tests/bmp180/stardrop-project.json" onChange={(event) => updateAdminTest('sourcePath', event.target.value)} /><input value={adminTest?.matchParts?.join(', ') || ''} placeholder="BMP180, BMP085" onChange={(event) => updateAdminTest('matchParts', event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></div><p>Pinler kart profilinden derleme sırasında üretilir.</p><button className="primary settings-login" disabled={!catalogAdmin || catalogLoading} onClick={saveAdminCatalog}><Save />GITHUB KATALOĞUNA KAYDET</button></Section></div> : <p className="workspace">Bu ekran için yönetim yetkisi gerekli.</p>) :
        <div className="workspace settings-page"><Section title="GITHUB TEST DEPOSU" action={githubUser ? <Badge tone="good">@{githubUser.login}</Badge> : <Badge tone="warn">GİRİŞ YOK</Badge>}><p>Hızlı Yükleme giriş gerektirmez. Test kodları bu depodan indirilir ve bilgisayarında derlenir.</p><div className="settings-grid"><input value={githubConfig.repository || ''} placeholder="owner/repo" onChange={(event) => updateGithubConfig('repository', event.target.value)} /><input value={githubConfig.ref || ''} placeholder="main" onChange={(event) => updateGithubConfig('ref', event.target.value)} /></div><button className="primary settings-login" disabled={githubLoginBusy || Boolean(githubUser)} onClick={startGithubLogin}><Github />{githubUser ? `GİRİŞ YAPILDI: ${githubUser.login}` : githubLoginBusy ? 'GİRİŞ BEKLENİYOR…' : 'GITHUB İLE GİRİŞ YAP'}</button><p>Özel depodaki testleri okumak için Contents: Read, Test Kütüphanesi’ne kayıt eklemek için Contents: Read and write gerekir. GitHub App tokeni kullanıyorsan uygulamanın da bu izinle depoya kurulmuş olması gerekir. Alternatif olarak yalnız bu depoya erişen fine-grained token gir; anahtar proje dosyasına yazılmaz.</p><div className="settings-grid"><input type="password" autoComplete="off" value={repoToken} placeholder={repoTokenSaved ? 'Depo anahtarı kayıtlı' : 'Fine-grained repo token'} onChange={(event) => setRepoToken(event.target.value)} /><button className="secondary" onClick={saveRepoAccess} disabled={!repoToken.trim()}>ANAHTARI KAYDET</button></div>{repoTokenSaved && <button className="secondary" onClick={removeRepoAccess}>KAYITLI ANAHTARI SİL</button>}</Section><Section title="GÜVENLİK DURUMU"><div className="security-list"><span><ShieldCheck />AI anahtarı: {secretStorageMode === 'memory' ? 'bu oturumun belleği' : 'OS credential store'}</span><span><ShieldCheck />GitHub token: {secretStorageMode === 'memory' ? 'bu oturumun belleği' : 'OS credential store'}</span><span><ShieldCheck />.stardrop export: anahtar ve token içermez</span></div></Section></div>}
    </section>;
  };
  const notificationCenter = <NotificationCenter esp={esp} notice={notice} entries={noticeHistory} onRetry={autoConnect} disabled={Boolean(hardwareBusy)}
    recoveryCount={(session === 'guest' ? guestWorkspace : workspace).state.recovery.length}
    onRecover={() => { (session === 'guest' ? guestWorkspace : workspace).undo(); setNotice('Önceki çalışma ayrı sekmede geri açıldı.'); }}/>;

  const startContent = <StartContent user={githubUser} busy={githubLoginBusy}
    onGithub={() => { if (githubUser) { setSession('github'); setMode('workbench'); } else startGithubLogin(); }}
    onGuest={() => { setSession('guest'); guestWorkspace.open('flash'); }}
    error={githubLoginError} preparing={githubLoginBusy && !deviceLogin}/>;
  const welcomeView = <div className="welcome-screen"><WelcomeStars /><aside className="welcome-sidebar">
    <div className="brand"><div><strong>STARDROP</strong><small>Remote Flash<br/>&amp; Test Platform</small></div></div>
    <div className="welcome-footer"><span>YILDIZ ROKET TAKIMI</span>{notificationCenter}</div>
    </aside><main className="welcome-content">{startContent}</main></div>;

  const guestView = <div className="guest-layout"><header className="guest-header"><div className="brand"><strong>STARDROP</strong></div>
    <div className="guest-header-actions"><button disabled={Boolean(hardwareBusy)} onClick={() => setSession('welcome')}>Girişe dön</button></div></header>
    <WorkspaceTabs workspace={guestWorkspace} lockedIds={lockedIds} drag={guestDrag} titles={titles}/>
    {guestWorkspace.mode === 'empty' && <EmptyWorkspace>{startContent}</EmptyWorkspace>}
    {guestWorkspace.state.documents.map((doc) => renderDocument(doc, guestWorkspace.state.activeId, guestWorkspace))}
    <div className="guest-notification-center">{notificationCenter}</div><DragPreview preview={guestDrag.preview}/></div>;

  const signedView = <div className="app-shell">
    <aside className="rail">
      <div className="brand"><div><strong>STARDROP</strong><small>Remote Flash<br/>&amp; Test Platform</small></div></div>
      <nav>
        <RailTool tool="flash" Icon={Upload} workspace={workspace} drag={drag}/>
        <RailTool tool="workbench" Icon={FlaskConical} workspace={workspace} drag={drag}/>
        <RailTool tool="library" Icon={BookOpen} workspace={workspace} drag={drag} onOpen={refreshLibrary}/>
        <RailTool tool="devices" Icon={Cpu} workspace={workspace} drag={drag}/>
        {catalogAdmin && <RailTool tool="admin" Icon={ShieldCheck} workspace={workspace} drag={drag}/>}
        <RailTool tool="settings" Icon={Settings} workspace={workspace} drag={drag}/>
      </nav>
      <div className="rail-footer"><div className="rail-account">{githubUser?.avatar_url && <img className="rail-avatar" src={githubUser.avatar_url} alt="" referrerPolicy="no-referrer" />}
        <div><span>{githubUser ? '@' + githubUser.login : 'MİSAFİR OTURUMU'}</span><div className="rail-account-actions">
          <button disabled={Boolean(hardwareBusy)} onClick={() => setSession('welcome')}>Girişe dön</button>
          <button onClick={logoutGithub} disabled={githubLogoutBusy || Boolean(hardwareBusy)}>{githubLogoutBusy ? 'Çıkılıyor…' : 'Çıkış yap'}</button>
        </div></div></div></div>{notificationCenter}
    </aside>
    <main>
      <WorkspaceTabs workspace={workspace} lockedIds={lockedIds} drag={drag} titles={titles}/>
      {mode === 'empty' && <EmptyWorkspace>{startContent}</EmptyWorkspace>}
      {workspace.state.documents.map((doc) => renderDocument(doc, workspace.state.activeId, workspace))}
    </main>
    <DragPreview preview={drag.preview}/>
    
  </div>;
  return <><div className="session-view" hidden={session !== 'welcome'}>{welcomeView}</div><div className="session-view" hidden={session !== 'guest'}>{guestView}</div><div className="session-view" hidden={session !== 'github'}>{signedView}</div><DeviceLogin challenge={deviceLogin} onOpen={() => invoke('github_device_open')} onCancel={cancelGithubLogin} /></>;
}
