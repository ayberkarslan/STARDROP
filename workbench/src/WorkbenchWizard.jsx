import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Cpu, Download, FileUp, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { addManualPeripheral, newBoardProfile, validateBoardProfile, validateTestTarget } from './lib/boardProfile.js';
import { buildableTargetPart, testsForComponent } from './lib/testCatalog.js';
import SelectMenu from './SelectMenu.jsx';
import PackagePinout from './PackagePinout.jsx';
import { deviceForComponent } from './lib/testCatalog.js';
import { overallConfidence } from './lib/boardProfile.js';
import BoardMap from './BoardMap.jsx';

const models = ['STM32F401CCU6', 'STM32F401CDU6', 'STM32F401CEU6', 'STM32F446RET6'].map((value) => ({ value, label: value }));
const protocols = [{ value: 'GPIO', label: 'LED · tek GPIO' }, { value: 'I2C', label: 'I²C sensör · SCL + SDA' }, { value: 'SPI', label: 'SPI sensör · SCK + MISO + MOSI + CS' }];
const defaultsFor = (protocol, mcuPart) => protocol === 'GPIO'
  ? { LED: mcuPart.startsWith('STM32F446') ? 'PA5' : 'PC13' }
  : protocol === 'I2C' ? { SCL: 'PB6', SDA: 'PB7' }
    : { SCK: 'PA5', MISO: 'PA6', MOSI: 'PA7', CS: 'PB0' };

export default function WorkbenchWizard({ profile, setProfile, sources, catalog, githubConfig, sourceStatus, sourceError,
  sourceBusy, refreshSource, activateSource, target, esp, activeSensor, activeComponent, setActiveComponent,
  editConnection, approveComponent, updateLedSetting, compatibleTests, selectedTest,
  setSelectedTestId, testBlocker, testBusy, testStage, flashBusy, flashLog, flashProgress, visualPending,
  finishVisualTest, setConfirmLedFlash, loadNetlist, importProject, exportProject, setAnalysis, setSources,
  bindTarget, refreshTarget, setFlashLog, setTestStage, setNotice, aiConfig, updateAiConfig, aiKey, setAiKey,
  aiBusy, runAiReview, aiReview, acceptedSuggestions, setAcceptedSuggestions, applySelectedAiSuggestions,
  diagnosticReport, testHistory }) {
  const [flow, setFlow] = useState(profile ? (sources.netlist ? 'net' : 'manual') : null);
  const [step, setStep] = useState(profile ? 'component' : 'start');
  const [boardName, setBoardName] = useState('Breadboard');
  const [mcuPart, setMcuPart] = useState('STM32F401CDU6');
  const [part, setPart] = useState('LED');
  const [protocol, setProtocol] = useState('GPIO');
  const [ref, setRef] = useState('D1');
  const [pins, setPins] = useState(defaultsFor('GPIO', 'STM32F401CDU6'));
  const [working, setWorking] = useState(false);
  const [showAdd, setShowAdd] = useState(flow === 'manual');
  const [localError, setLocalError] = useState('');
  const [selectedPinIndex, setSelectedPinIndex] = useState(0);
  const [showReview, setShowReview] = useState(false);

  const steps = flow === 'manual' ? ['Kart', 'Bileşen', 'Test', 'Pinler', 'Yükleme']
    : flow === 'net' ? ['Dosya', 'Bileşen', 'Test', 'Pinler', 'Yükleme'] : [];
  const stepNames = flow === 'manual' ? ['board', 'component', 'test', 'pins', 'flash']
    : ['file', 'component', 'test', 'pins', 'flash'];
  const stepIndex = stepNames.indexOf(step);
  const currentConnections = profile?.connections?.filter((item) => item.componentRef === activeComponent) || [];
  const selectedValidation = useMemo(() => {
    if (!activeSensor || !profile) return null;
    const own = validateBoardProfile({ ...profile, components: [activeSensor], connections: currentConnections });
    const conflicts = validateBoardProfile(profile).errors.filter((error) => error.includes(`${activeComponent}:`) && !own.errors.includes(error));
    return { ...own, valid: own.valid && conflicts.length === 0, errors: [...own.errors, ...conflicts] };
  }, [profile, activeSensor, activeComponent]);
  const device = deviceForComponent(catalog, activeSensor);
  const requiredRoles = selectedTest?.requiredRoles
    || device?.interfaces?.find((item) => item.protocol === activeSensor?.protocol)?.requiredRoles || null;
  const testValidation = activeSensor && profile ? validateTestTarget(profile, activeComponent, requiredRoles) : null;
  const compilerReady = buildableTargetPart(profile?.mcu?.part);
  const matchingTests = testsForComponent(catalog, activeSensor, profile?.mcu?.part);

  useEffect(() => { if (step === 'test') refreshSource(); }, [step]);

  const start = (method) => { setFlow(method); setShowAdd(method === 'manual'); setStep(method === 'manual' ? 'board' : 'file'); setLocalError(''); };
  const reset = () => { setFlow(null); setStep('start'); setProfile(null); setActiveComponent(null); setAnalysis(null);
    setSources({ netlist: null, schematic: null, bom: null, boardImage: null }); setLocalError(''); };
  const back = () => {
    setLocalError('');
    if (stepIndex <= 0) { reset(); return; }
    setStep(stepNames[stepIndex - 1]);
  };
  const createBoard = () => {
    try {
      if (!boardName.trim()) throw new Error('Karta bir ad ver.');
      setProfile(newBoardProfile({ name: boardName.trim(), mcuPart }));
      setAnalysis(null); setSources({ netlist: null, schematic: null, bom: null, boardImage: null });
    setActiveComponent(null); setShowAdd(true); setStep('component'); setLocalError('');
    } catch (error) { setLocalError(error.message); }
  };
  const addComponent = () => {
    try {
      const created = addManualPeripheral(profile, { part, protocol, ref, pins });
      setProfile(created); setActiveComponent(ref.trim().toUpperCase()); setShowAdd(false); setStep('test'); setLocalError('');
    } catch (error) { setLocalError(error.message); }
  };
  const chooseComponent = (componentRef) => { setActiveComponent(componentRef); setStep('test'); setLocalError(''); };
  const readNetlist = async (file) => {
    if (!file) return;
    setWorking(true); setLocalError('');
    try { if (await loadNetlist(file)) setStep('component'); else setLocalError('Dosya okunamadı; alt soldaki durum mesajına bak.'); }
    finally { setWorking(false); }
  };
  const readProject = async (file) => {
    if (!file) return;
    setWorking(true); setLocalError('');
    try { if (await importProject(file)) setStep('component'); else setLocalError('Proje açılamadı; alt soldaki durum mesajına bak.'); }
    finally { setWorking(false); }
  };
  const confirmPins = async () => {
    if (!selectedValidation?.valid) { setLocalError(selectedValidation?.errors.join(' ') || 'Pinleri kontrol et.'); return; }
    approveComponent(activeComponent); setLocalError('');
    if (selectedTest) await continueWithTest();
  };
  const continueWithTest = async () => {
    if (!selectedTest) { setLocalError('Önce hazır bir test seç.'); return; }
    if (!compilerReady) { setLocalError('Bu modelin yerel derleme desteği eklenmeden flash yapılamaz.'); return; }
    setWorking(true); setLocalError('');
    try {
      if (!sourceStatus?.activeSha || (sourceStatus.latestSha && sourceStatus.latestSha !== sourceStatus.activeSha)) {
        const activated = await activateSource();
        if (!activated) { setLocalError('GitHub test kaynağı indirilemedi; bağlantı ve depo erişimini kontrol et.'); return; }
      }
      setFlashLog([]); setTestStage(''); setStep('flash');
    } finally { setWorking(false); }
  };
  const startMissingComponent = () => { setPart('LED'); setProtocol('GPIO'); setRef('D1'); setShowAdd(true);
    setPins(defaultsFor('GPIO', profile.mcu.part)); setStep('component'); setLocalError(''); };
  const assignSelectedPin = (pin) => {
    const connection = currentConnections[selectedPinIndex];
    if (!connection) return;
    editConnection(profile.connections.indexOf(connection), 'mcuPin', pin);
    setLocalError('');
    if (selectedPinIndex + 1 < currentConnections.length) setSelectedPinIndex(selectedPinIndex + 1);
  };

  return <div className="workspace wizard-workspace">
    {profile && <div className="wizard-top wizard-actions"><button className="wizard-text-button" onClick={exportProject}>.STARDROP KAYDET</button></div>}
    {flow && <div className="wizard-steps" aria-label="İş akışı">{steps.map((label, index) => <span key={label} className={index === stepIndex ? 'current' : index < stepIndex ? 'done' : ''}><i>{index + 1}</i>{label}</span>)}</div>}
    <div className="wizard-body">
      {step !== 'start' && <button className="wizard-back" onClick={back}><ArrowLeft size={15}/>GERİ</button>}
      {step === 'start' && <><h2>Nasıl başlamak istersin?</h2><p>Bağlantıları kendin seç veya kart dosyanı yükle.</p><div className="wizard-choices"><button onClick={() => start('manual')}><Cpu/><strong>Bağlantıları kendim seçeceğim</strong><small>STM32 modelini, sensörü ve pinleri elle gir.</small><ArrowRight className="wizard-arrow"/></button><button onClick={() => start('net')}><FileUp/><strong>Kart dosyamı yükleyeceğim</strong><small>Altium .NET dosyasındaki bileşen ve pin adaylarını incele.</small><ArrowRight className="wizard-arrow"/></button></div></>}
      {step === 'board' && <><span className="eyebrow">1 / KART</span><h2>Hangi STM32?</h2><p>Test yazılımı bu modele göre derlenecek. Bağlı hedefin de aynı model olması gerekir.</p><div className="wizard-fields"><label>Kart adı<input value={boardName} onChange={(event) => setBoardName(event.target.value)}/></label><label>STM32 modeli<SelectMenu ariaLabel="STM32 modeli" value={mcuPart} options={models} onChange={setMcuPart}/></label></div><button className="primary wizard-next" onClick={createBoard}>DEVAM ET <ArrowRight size={16}/></button></>}
      {step === 'file' && <><span className="eyebrow">1 / KART DOSYASI</span><h2>Altium .NET dosyanı yükle</h2><p>Algılanan sensörler ve bağlantı adayları sonraki ekranda görünecek. Pinleri flash öncesinde sen onaylayacaksın.</p><div className="wizard-file-options"><label className="wizard-file"><FileUp/><strong>.NET DOSYASI SEÇ</strong><small>Altium netlist · .NET veya .txt</small><input type="file" accept=".NET,.net,.txt" onChange={(event) => readNetlist(event.target.files?.[0])}/></label><label className="wizard-file"><Download/><strong>KAYITLI .STARDROP AÇ</strong><small>Daha önce bıraktığın yerden devam et</small><input type="file" accept=".stardrop" onChange={(event) => readProject(event.target.files?.[0])}/></label></div>{working && <p>Dosya okunuyor…</p>}</>}
      {step === 'component' && profile && <><span className="eyebrow">2 / BİLEŞEN</span><h2>{flow === 'net' ? 'Kartta neyi test edeceğiz?' : 'Neyi bağladın?'}</h2><p>{profile.mcu.part} · {profile.name}. {flow === 'net' ? 'Algılanan bileşenlerden birini seç; listede olmayanı elle ekleyebilirsin.' : 'Sensörün adını ve bağlantı türünü yaz; testler bu bilgiye göre filtrelenecek.'}</p>{profile.components.length > 0 && <div className="wizard-components">{profile.components.map((component) => <button key={component.ref} onClick={() => chooseComponent(component.ref)}><Activity size={18}/><span><strong>{component.part}</strong><small>{component.ref} · {component.protocol}</small></span><ArrowRight size={16}/></button>)}</div>}{(flow === 'net' || profile.components.length > 0) && <button className="wizard-text-button" onClick={startMissingComponent}>{flow === 'net' ? 'LED veya başka bileşen görünmüyor mu? Elle ekle' : 'Başka bileşen ekle'}</button>}{showAdd && <div className="wizard-add"><h3>{profile.components.length ? 'Yeni bileşen ekle' : 'Bileşeni tanımla'}</h3><div className="wizard-fields"><label>Parça adı<input value={part} placeholder="LED, MPU6050, MS5611..." onChange={(event) => setPart(event.target.value.toUpperCase())}/></label><label>Bağlantı türü<SelectMenu ariaLabel="Bağlantı türü" value={protocol} options={protocols} onChange={(value) => { setProtocol(value); setPins(defaultsFor(value, profile.mcu.part)); setRef(value === 'GPIO' ? 'D1' : 'U2'); if (value === 'GPIO') setPart('LED'); }}/></label><label>Şemadaki adı<input value={ref} placeholder="U2 veya D1" onChange={(event) => setRef(event.target.value.toUpperCase())}/></label></div><button className="primary wizard-next" onClick={addComponent}>TESTLERİ GÖR <ArrowRight size={16}/></button></div>}</>}
      {step === 'component' && profile && <div className="wizard-context">
        <div className="wizard-context-line"><span>{sources.netlist ? `Parser güveni: ${overallConfidence(profile)}%` : 'Manuel kart profili'} · {profile.components.length} bileşen</span><span>Hedef UID: {profile.targetUid || 'atanmadı'}</span></div>
        <details><summary>Kart görünümü ve fotoğrafı</summary><BoardMap profile={profile} components={profile.components} target={target} image={sources.boardImage} selectedRef={activeComponent} onSelect={chooseComponent} onImageChange={(file) => { if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setNotice('Kart fotoğrafı PNG, JPEG veya WebP ve en fazla 8 MB olmalı.'); return; } setSources((current) => ({ ...current, boardImage: file })); }} /><p className="wizard-hint">Düğümler görsel özet içindir; PCB üzerindeki fiziksel koordinatları göstermez.</p></details>
        <details open={showReview} onToggle={(event) => setShowReview(event.currentTarget.open)}><summary>Şema PDF ve isteğe bağlı AI incelemesi</summary>
          <label className="wizard-attachment">{sources.schematic ? `Şema PDF: ${sources.schematic.name}` : 'Şema PDF ekle'}<input type="file" accept="application/pdf,.pdf" onChange={(event) => setSources((current) => ({ ...current, schematic: event.target.files?.[0] || null }))}/></label>
          <p className="wizard-hint">İncelemeyi başlatırsan profil, .NET özeti ve varsa şema PDF seçtiğin AI sağlayıcısına gönderilir. Öneriler kendiliğinden uygulanmaz.</p>
          <div className="ai-config"><input value={aiConfig.endpoint || ''} placeholder="API adresi" onChange={(event) => updateAiConfig('endpoint', event.target.value)}/><input value={aiConfig.model || ''} placeholder="Model" onChange={(event) => updateAiConfig('model', event.target.value)}/><input type="password" value={aiKey} placeholder="API anahtarı" onChange={(event) => setAiKey(event.target.value)}/></div>
          <button className="secondary wizard-review-button" disabled={aiBusy || !aiKey} onClick={runAiReview}>{aiBusy ? 'İNCELENİYOR…' : 'AI İNCELEMESİNİ BAŞLAT'}</button>
          {aiReview && <div className="ai-result"><strong>{aiReview.summary}</strong>{aiReview.suggestions.length === 0 ? <p>Düzeltme önerisi yok.</p> : aiReview.suggestions.map((suggestion) => <label key={suggestion.id} className="ai-suggestion"><input type="checkbox" checked={acceptedSuggestions.includes(suggestion.id)} onChange={(event) => setAcceptedSuggestions((items) => event.target.checked ? [...items, suggestion.id] : items.filter((id) => id !== suggestion.id))}/><span><b>{suggestion.confidence}% · bağlantı #{suggestion.connectionIndex + 1}</b><small>{suggestion.reason} — {suggestion.evidence}</small></span></label>)}{aiReview.suggestions.length > 0 && <button className="secondary" disabled={!acceptedSuggestions.length} onClick={applySelectedAiSuggestions}>SEÇİLİ ÖNERİLERİ UYGULA</button>}</div>}
        </details>
      </div>}
      {step === 'pins' && activeSensor && <>
        <span className="eyebrow">4 / PİNLER</span>
        <h2>{activeSensor.part} bağlantıları</h2>
        <p>{activeSensor.ref} için bulunan bağlantıları kontrol et. Sensör hattını ve ardından STM32 paketindeki bacağı seç. SWD ve pakette olmayan pinler reddedilir.</p>
        {['I2C', 'SPI'].includes(activeSensor.protocol) && <div className="wizard-fields">
          <label>Bağlantı bus’ı<SelectMenu ariaLabel="Bağlantı bus’ı" value={currentConnections[0]?.peripheral || ''}
            options={(activeSensor.protocol === 'I2C' ? ['SOFT_I2C_1', 'I2C1', 'I2C2', 'I2C3'] : ['SPI1', 'SPI2', 'SPI3']).map((value) => ({ value, label: value === 'SOFT_I2C_1' ? 'Yazılımsal I²C · esnek GPIO' : value }))}
            onChange={(value) => currentConnections.forEach((connection) => editConnection(profile.connections.indexOf(connection), 'peripheral', value))}/></label>
        </div>}
        <PackagePinout profile={profile} connections={currentConnections} selectedIndex={selectedPinIndex}
          onSelectIndex={setSelectedPinIndex} onAssign={assignSelectedPin}/>
        <details className="wizard-pin-details"><summary>Pin ve bus değerlerini elle düzenle</summary><div className="wizard-pin-table">{currentConnections.map((connection) => { const index = profile.connections.indexOf(connection); return <div key={`${connection.role}-${index}`} className="wizard-pin-row"><strong>{connection.role}<small>{connection.sensorPin || '?'}</small></strong><label>STM32 GPIO<input value={connection.mcuPin || ''} onChange={(event) => editConnection(index, 'mcuPin', event.target.value.toUpperCase())}/></label><label>Bus<input value={connection.peripheral || ''} onChange={(event) => editConnection(index, 'peripheral', event.target.value.toUpperCase())}/></label><span>{connection.approved ? 'ONAYLI' : `${connection.confidence}% güven`}</span></div>; })}</div></details>
        {device?.electricalNotes?.map((note) => <div className="validation warn" key={note}>{note}</div>)}
        {activeSensor.protocol === 'GPIO' && <div className="wizard-fields">
          <label>LED yönü<SelectMenu ariaLabel="LED yönü" value={activeSensor.activeLow ? 'low' : 'high'}
            options={[{ value: 'low', label: 'Aktif düşük' }, { value: 'high', label: 'Aktif yüksek' }]}
            onChange={(value) => updateLedSetting('activeLow', value === 'low')}/></label>
          <label>Yanıp sönme aralığı (ms)<input type="number" min="50" max="5000"
            value={activeSensor.blinkMs || 100} onChange={(event) => updateLedSetting('blinkMs', Number(event.target.value))}/></label>
        </div>}
        {selectedValidation?.errors.length > 0 && <div className="validation bad">{selectedValidation.errors.map((error) => <span key={error}>{error}</span>)}</div>}
        {selectedValidation?.warnings.length > 0 && <div className="validation warn">{selectedValidation.warnings.slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)}</div>}
        <button className="primary wizard-next" disabled={!selectedValidation?.valid || working} onClick={confirmPins}><ShieldCheck size={16}/>{selectedTest ? 'ONAYLA VE TESTİ HAZIRLA' : 'PİNLERİ ONAYLA'}</button>
        {!selectedTest && <p className="wizard-hint">Bu bileşenin kodu henüz hazır değil. Pinleri kaydedebilirsin; yükleme test hazır olunca açılır.</p>}
      </>}
      {step === 'test' && activeSensor && <><span className="eyebrow">3 / TEST</span><h2>{activeSensor.part} için neyi deneyeceğiz?</h2><p>{githubConfig.repository} kataloğunda {profile.mcu.part} ile eşleşen testler gösteriliyor. Kod bekleyen testlerin pinlerini yine de inceleyebilirsin.</p><div className="wizard-catalog-head"><span>{matchingTests.length} eşleşme · {compatibleTests.length} hazır</span><button className="wizard-text-button" disabled={sourceBusy} onClick={refreshSource}><RefreshCw size={14}/>YENİLE</button></div><div className="wizard-tests">{matchingTests.map((item) => <button key={item.id} disabled={item.status !== 'ready'} className={selectedTest?.id === item.id ? 'selected' : ''} onClick={() => setSelectedTestId(item.id)}><span><strong>{item.name}</strong><small>{item.description || item.id}</small></span><em>{item.status === 'ready' ? 'HAZIR' : 'KOD BEKLENİYOR'}</em></button>)}{matchingTests.length === 0 && <p>Bu bileşen için henüz test yok. Uygun kod eklendiğinde burada görünecek.</p>}</div>{sourceError && <div className="validation warn">{sourceError}</div>}{!compilerReady && <div className="validation warn">Bu MCU için pinout hazır; yerel derleme desteği henüz yok.</div>}<button className="primary wizard-next" onClick={() => { setSelectedPinIndex(0); setStep('pins'); setLocalError(''); }}>BAĞLANTILARI GÖR <ArrowRight size={16}/></button></>}
      {step === 'flash' && activeSensor && <><span className="eyebrow">5 / UZAKTAN YÜKLEME</span><h2>{selectedTest?.name || 'Test'} hazır</h2><p>Seçilen test GitHub kaynağından bilgisayarında derlenecek, ardından ESP32 üzerinden STM32’ye yüklenecek. .bin veya .elf seçmen gerekmiyor.</p><div className="wizard-flash-facts"><div><small>HEDEF</small><strong>{target?.connected ? `${target.model} · ${target.uid}` : 'STM32 bekleniyor'}</strong></div><div><small>TEST</small><strong>{activeSensor.part} · {selectedTest?.name || 'Seçilmedi'}</strong></div><div><small>KAYNAK</small><strong>{sourceStatus?.activeSha?.slice(0, 12) || 'İndirilmedi'}</strong></div></div>{target?.connected && profile.targetUid !== target.uid && <button className="secondary" onClick={bindTarget}>BAĞLI STM32’Yİ BU KARTLA EŞLEŞTİR</button>}{!target?.connected && <button className="secondary" onClick={refreshTarget}>STM32’Yİ YENİDEN ARA</button>}<p className="destructive-note">Yükleme, STM32’deki mevcut yazılımı siler. Sensörün çalışıp çalışmadığını test sonucundan veya fiziksel gözlemle kontrol edeceksin.</p><button className="primary wizard-next" disabled={testBusy || flashBusy || Boolean(testBlocker) || esp.status !== 'online'} onClick={() => setConfirmLedFlash(true)}><Send size={16}/>{testBusy || flashBusy ? 'YÜKLENİYOR…' : 'DERLE VE STM32’YE YÜKLE'}</button>{testBlocker && <div className="validation warn">{testBlocker}</div>}{testStage && <p className="wizard-hint">{testStage}</p>}{(flashBusy || flashLog.length > 0) && <><div className="flash-feedback"><div className="flash-feedback-top"><span>{flashBusy ? 'İŞLEM SÜRÜYOR' : flashProgress === 100 ? 'DOĞRULANDI' : 'SON İŞLEM'}</span><strong>{flashProgress}%</strong></div><div className="progress"><i style={{ width: `${flashProgress}%` }}/></div></div><div className="flash-terminal" role="log" aria-label="SWD işlem terminali">{flashLog.map((entry, index) => <p key={index} className={`log-${['info', 'success', 'warn', 'error', 'chunk'].includes(entry.type) ? entry.type : 'info'}`}>[{entry.time}] {entry.msg}</p>)}</div></>}{visualPending && <div className="visual-confirm"><span>Fiziksel test başarılı mı?</span><button onClick={() => finishVisualTest(true)}>EVET</button><button onClick={() => finishVisualTest(false)}>HAYIR</button></div>}</>}
      {step === 'flash' && diagnosticReport && <div className={`diagnostic ${diagnosticReport.state?.toLowerCase() || 'waiting'}`}><div><strong>STM32 RAPORU · {diagnosticReport.state || 'BEKLENİYOR'}</strong><small>{diagnosticReport.valid ? 'Firmware çalıştı; fiziksel sonuç kullanıcı onayı bekliyor.' : diagnosticReport.reason || 'Firmware raporu bekleniyor.'}</small></div></div>}
      {step === 'flash' && testHistory.length > 0 && <p className="wizard-hint">Son test: {testHistory.at(-1).componentRef} · {testHistory.at(-1).status} · {new Date(testHistory.at(-1).at).toLocaleString('tr-TR')}</p>}
      {localError && <div className="validation bad">{localError}</div>}
    </div>
  </div>;
}
