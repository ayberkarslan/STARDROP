import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { addAuditEvent, confidenceForConnection, validateTestTarget } from './lib/boardProfile.js';
import { applyAiSuggestions, requestAiReview } from './lib/aiReview.js';
import { profileFromNetlist } from './lib/netlistProfile.js';
import { exportStardropProject, importStardropProject } from './lib/projectArchive.js';
import { saveSecret } from './lib/secretStore.js';
import { hash32FromSha256, sha256Hex } from './lib/diagnosticArtifact.js';
import { espJson } from './lib/espTransport.js';
import { buildableTargetPart, testsForComponent } from './lib/testCatalog.js';
import WorkbenchWizard from './WorkbenchWizard.jsx';
import Popup from './Popup.jsx';
import useFirmwareJob from './useFirmwareJob.js';

export default function TestSession({ documentId, initialData, services, onDraftChange }) {
  const { session, githubUser, esp, target, catalog, githubConfig, sourceStatus, sourceError, sourceBusy,
    refreshSource, activateSource, activeBridge, bridge, refreshTarget, setNotice,
    aiConfig, updateAiConfig, aiKey, setAiKey, hardware, hardwareBusy, preferences, recordBoardEvent } = services;
  const [profile, setProfile] = useState(initialData?.profile || null);
  const [analysis, setAnalysis] = useState(null);
  const [sources, setSources] = useState(initialData?.sources || { netlist: null, schematic: null, bom: null, boardImage: null });
  const [activeComponent, setActiveComponent] = useState(initialData?.componentRef || null);
  const [selectedTestId, setSelectedTestId] = useState(initialData?.testId || 'led-blink');
  const [testBusy, setTestBusy] = useState(false);
  const [testStage, setTestStage] = useState('');
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [telemetryContext, setTelemetryContext] = useState(null);
  const [testHistory, setTestHistory] = useState(initialData?.testHistory || []);
  const [visualPending, setVisualPending] = useState(null);
  const [confirmLedFlash, setConfirmLedFlash] = useState(false);
  const [aiReview, setAiReview] = useState(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const currentProfile = useRef(profile);
  currentProfile.current = profile;
  const reviewProfile = useRef(null);
  const diagnosticTimer = useRef(null);
  const { flashFirmware, flashLog, flashProgress, flashBusy, setFlashLog } = useFirmwareJob({ documentId, ...services });
  const normalizedBridge = activeBridge || bridge.replace(/\/$/, '');
  const activeSensor = profile?.components.find((item) => item.ref === activeComponent) || null;
  const isLedTest = activeSensor?.protocol === 'GPIO' && activeSensor?.part === 'LED';
  const compatibleTests = testsForComponent(catalog, activeSensor, profile?.mcu?.part, { readyOnly: true });
  const selectedTest = compatibleTests.find((item) => item.id === selectedTestId) || compatibleTests[0] || null;
  const testValidation = activeSensor ? validateTestTarget(profile, activeSensor.ref, selectedTest?.requiredRoles) : null;
  const testBlocker = hardwareBusy && hardwareBusy.ownerId !== documentId ? 'Başka donanım işlemi sürüyor; testini hazırlamaya devam edebilirsin.'
    : !target?.connected ? 'Önce ESP32 üzerinden STM32 hedefini bul.'
    : !profile?.targetUid || profile.targetUid !== target.uid ? 'Bu kart profilini bağlı STM32 UID’siyle eşleştir.'
    : !githubUser ? 'Ayarlar ekranından GitHub girişi yap.'
    : !buildableTargetPart(profile?.mcu?.part) ? 'Bu MCU için yerel HAL derleme desteği henüz yok.'
    : preferences && preferences.trustedRepository !== githubConfig.repository ? 'Bu depoyu Ayarlar → Güvenlik bölümünde güvenilir olarak seç.'
    : !selectedTest ? 'Bu bileşen için hazır test kataloğa henüz eklenmedi.'
    : selectedTest.build !== 'stm32-hal-v1' || !['visual', 'sram'].includes(selectedTest.result) ? 'Bu test için desteklenen kaynak veya sonuç sözleşmesi yok.'
    : sourceBusy ? 'Kod kaynağı güncelleniyor; indirme bitince testi başlat.'
    : !sourceStatus?.activeSha ? 'Önce test kaynağını GitHub’dan indir.'
    : isLedTest && [activeSensor.onMs ?? activeSensor.blinkMs, activeSensor.offMs ?? activeSensor.blinkMs].some(ms => !Number.isInteger(ms) || ms < 50 || ms > 60000) ? 'Yanma ve sönük kalma süreleri 0,05–60 saniye olmalı.'
    : !testValidation?.valid ? 'Önce sensör pinlerini doğrula ve onayla.' : null;

  useEffect(() => {
    onDraftChange(documentId, { profile, sources, analysis, activeComponent, selectedTest, testHistory });
  }, [documentId, profile, sources, analysis, activeComponent, selectedTest, testHistory, onDraftChange]);

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

  const loadNetlist = async (file) => {
    if (session !== 'github' || !githubUser) { setNotice('Otomatik pin analizi için GitHub oturumu gerekli.'); return; }
    if (!file) return;
    try {
      const netlist = await file.text();
      const result = profileFromNetlist(netlist, { netlistName: file.name });
      setProfile(result.profile); setAnalysis(result.analysis);
      setSources((current) => ({ ...current, netlist })); setActiveComponent(result.profile.components[0]?.ref || null);
      setNotice(`${result.profile.components.length} cihaz adayı bulundu; pinleri onayla.`);
      return true;
    } catch (error) { setNotice(`NET okunamadı: ${error.message}`); return false; }
  };

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

  const runAiReview = async () => {
    if (!profile || aiBusy) return;
    const snapshot = profile;
    setAiBusy(true); setAiReview(null); setAcceptedSuggestions([]);
    try {
      await saveSecret('ai_api_key', aiKey);
      const review = await requestAiReview({ ...aiConfig, apiKey: aiKey, profile, netlist: sources.netlist, schematicPdf: sources.schematic });
      if (currentProfile.current !== snapshot) { setNotice('İnceleme sırasında kart değişti. Güncel kart için AI kontrolünü yeniden başlat.'); return; }
      reviewProfile.current = snapshot;
      setAiReview(review); setNotice(`AI incelemesi ${review.suggestions.length} öneri üretti; hiçbir değişiklik uygulanmadı.`);
    } catch (error) { setNotice(`AI incelemesi başarısız: ${error.message}`); }
    finally { setAiBusy(false); }
  };

  const applySelectedAiSuggestions = () => {
    if (currentProfile.current !== reviewProfile.current) { setNotice('Kart değişti; eski AI önerileri uygulanmadı. Yeniden kontrol et.'); return; }
    setProfile((current) => applyAiSuggestions(current, aiReview, acceptedSuggestions));
    setNotice(`${acceptedSuggestions.length} AI önerisi profile uygulandı; hepsi yeniden onay bekliyor.`);
  };

  const runHardwareTest = async () => {
    if (testBusy || !selectedTest || testBlocker) { if (testBlocker) setNotice(testBlocker); return; }
    let lease;
    try { lease = hardware.acquire(documentId, `${profile.name} · ${selectedTest.name}`); }
    catch (error) { setNotice(error.message); return; }
    const requestId = crypto.randomUUID();
    setConfirmLedFlash(false); setVisualPending(null); setTestBusy(true); setDiagnosticReport(null);
    setTelemetryContext(null);
    try {
      const profileJson = JSON.stringify(profile);
      setTestStage(`${selectedTest.name} GitHub kaynağından bilgisayarda derleniyor…`);
      const built = await invoke('compile_code_test', { request: { repository: githubConfig.repository, testId: selectedTest.id,
        profileJson, componentRef: activeSensor.ref, requestId, mcuPart: profile.mcu.part, targetUid: target.uid } });
      if (built.sourceSha !== sourceStatus.activeSha) throw new Error('Derleme kaynağı değişti; testi yeni kaynakla tekrar başlat.');
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
      if (built.elfBytes?.length) file.debugElf = new File([Uint8Array.from(built.elfBytes)], `stardrop-${selectedTest.id}.elf`);
      if (!await flashFirmware(file, lease)) throw new Error('ESP32 flash işlemi başarısız.');
      const hashes = {
        test: hash32FromSha256(await sha256Hex(selectedTest.id)),
        profile: hash32FromSha256(await sha256Hex(profileJson)),
        run: hash32FromSha256(await sha256Hex(requestId)),
      };
      if (selectedTest.telemetryAbi === 1) setTelemetryContext({ uid: live.uid, model: live.model,
        label: target.label || profile.name, testName: selectedTest.name,
        expected: { testIdHash: hashes.test, profileHash: hashes.profile, runHash: hashes.run } });
      else if (file.debugElf) setTelemetryContext({ uid: live.uid, model: live.model, label: target.label || profile.name, mode: 'variables' });
      if (selectedTest.result === 'sram') {
        setTestStage('STM32 test raporu okunuyor…');
        const report = await waitForDiagnosticReport(hashes);
        setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
          testId: selectedTest.id, targetUid: live.uid, status: report.state, sourceSha: built.sourceSha,
          firmwareSha256: built.sha256, report }]);
        void recordBoardEvent(live.uid, 'test', `${selectedTest.name}: ${report.state}`,
          `${activeSensor.ref} · ${report.state === 'PASS' ? 'Başarılı' : 'Raporu incele'}`).catch(() => {});
        setTestStage(`STM32 test raporu: ${report.state}.`);
        return;
      }
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
        testId: selectedTest.id, targetUid: live.uid, status: 'PENDING_VISUAL', sourceSha: built.sourceSha,
        firmwareSha256: built.sha256, pin: profile.connections.find((item) => item.componentRef === activeSensor.ref)?.mcuPin,
        blinkMs: activeSensor.blinkMs, onMs: activeSensor.onMs ?? activeSensor.blinkMs, offMs: activeSensor.offMs ?? activeSensor.blinkMs, confirmation: 'VISUAL_REQUIRED' }]);
      setVisualPending(requestId);
      setTestStage('GitHub test firmware’i yüklendi. Sonucu gözle kontrol et.');
    } catch (error) {
      setTestStage(`${selectedTest.name} durdu: ${error.message}`);
      setNotice(`Donanım testi başarısız: ${error.message}`);
      setTestHistory((items) => [...items, { at: new Date().toISOString(), requestId, componentRef: activeSensor.ref,
        testId: selectedTest.id, status: 'ERROR', error: error.message }]);
      if (target?.uid || profile?.targetUid) void recordBoardEvent(target?.uid || profile.targetUid, 'test', `${selectedTest.name}: hata`, error.message).catch(() => {});
    } finally { setTestBusy(false); hardware.release(lease); }
  };

  const finishVisualTest = (passed) => {
    if (!visualPending) return;
    if (target?.uid) void recordBoardEvent(target.uid, 'test', `${selectedTest?.name || 'Görsel test'}: ${passed ? 'başarılı' : 'başarısız'}`,
      `${activeSensor?.ref || 'Bileşen'} · gözle doğrulandı`).catch(() => {});
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
      setActiveComponent(data.profile.components[0]?.ref || null); setNotice('STARDROP projesi güvenle geri yüklendi.');
      return true;
    } catch (error) { setNotice(`Proje açılamadı: ${error.message}`); return false; }
  };


  return <div className="test-session">
    <fieldset className="session-controls" disabled={testBusy || flashBusy}>
      <WorkbenchWizard onShare={() => services.shareTest(documentId)} preset={initialData?.catalogPreset} profile={profile} setProfile={setProfile} sources={sources} catalog={catalog} githubConfig={githubConfig} sourceStatus={sourceStatus} sourceError={sourceError} sourceBusy={sourceBusy} refreshSource={refreshSource} activateSource={activateSource} target={target} esp={esp} activeSensor={activeSensor} activeComponent={activeComponent} setActiveComponent={setActiveComponent} editConnection={editConnection} approveComponent={approveComponent} updateLedSetting={updateLedSetting} compatibleTests={compatibleTests} selectedTest={selectedTest} setSelectedTestId={setSelectedTestId} testBlocker={testBlocker} testBusy={testBusy} testStage={testStage} flashBusy={flashBusy} flashLog={flashLog} flashProgress={flashProgress} visualPending={visualPending} finishVisualTest={finishVisualTest} setConfirmLedFlash={setConfirmLedFlash} loadNetlist={loadNetlist} importProject={importProject} exportProject={exportProject} setAnalysis={setAnalysis} setSources={setSources} bindTarget={() => setProfile((current) => addAuditEvent({ ...current, targetUid: target.uid, targetLabel: target.label || current.name }, 'TARGET_UID_BOUND', { uid: target.uid }))} refreshTarget={refreshTarget} setFlashLog={setFlashLog} setTestStage={setTestStage} setNotice={setNotice} aiConfig={aiConfig} updateAiConfig={updateAiConfig} aiKey={aiKey} setAiKey={setAiKey} aiBusy={aiBusy} runAiReview={runAiReview} aiReview={aiReview} acceptedSuggestions={acceptedSuggestions} setAcceptedSuggestions={setAcceptedSuggestions} applySelectedAiSuggestions={applySelectedAiSuggestions} diagnosticReport={diagnosticReport} testHistory={testHistory} />
    </fieldset>
    {telemetryContext && <button className="secondary" disabled={testBusy || flashBusy || Boolean(hardwareBusy)} onClick={() => services.openTelemetry(telemetryContext)}>CANLI İZLEMEYİ AÇ →</button>}
    {confirmLedFlash && <Popup className="confirm-card" labelledBy="led-confirm-title" onClose={() => setConfirmLedFlash(false)}><h2 id="led-confirm-title">STM32 yazılımı değişecek</h2><p>{selectedTest?.name || 'Donanım testi'} için mevcut firmware silinip yerel derlenen kod yüklenecek. Hedef: {target?.model || 'bilinmiyor'} · {target?.uid || 'UID yok'}</p><div><button className="secondary" onClick={() => setConfirmLedFlash(false)}>VAZGEÇ</button><button className="primary" onClick={runHardwareTest}>DERLE VE YÜKLE</button></div></Popup>}
  </div>;
}
