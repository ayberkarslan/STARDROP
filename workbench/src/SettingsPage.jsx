import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Check, ChevronRight, Download, Upload, ShieldCheck } from 'lucide-react';
import SelectMenu from './SelectMenu.jsx';
import Popup from './Popup.jsx';
import { makeBackup, parseBackup, readiness, redact } from './lib/settings.js';

const sections = [
  { id: 'system', title: 'Sistem kontrolü', hint: 'hazır derleyici esp stm bağlantı firmware' },
  { id: 'sources', title: 'Test kaynakları', hint: 'github depo dal token anahtar hatırla önbellek çevrimdışı güncelle' },
  { id: 'workshop', title: 'Atölye ve yedekleme', hint: 'kart uid isim profil bağlantı yedek geri yükle' },
  { id: 'measure', title: 'Ölçüm ve kayıt', hint: 'csv klasör sıcaklık basınç birim örnek aralık' },
  { id: 'security', title: 'Güvenlik', hint: 'izin kasa doğrulama güvenilir onay' },
  { id: 'appearance', title: 'Görünüm', hint: 'yazı ölçek font hareket başlangıç ekran' },
  { id: 'diagnostics', title: 'Tanılama', hint: 'hata rapor sürüm günlük destek' },
];
function Row({ title, description, children }) { return <div className="setting-row"><div><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="setting-control">{children}</div></div>; }
function Pick({ title, value, choices, change }) { return <SelectMenu ariaLabel={title} value={String(value)} options={choices.map(([value, label]) => ({ value: String(value), label }))} onChange={change}/>; }
const compact = sha => sha ? sha.slice(0, 12) : 'İndirilmedi';

export default function SettingsPage({ services, account }) {
  const { preferences, updatePreferences, githubConfig, updateGithubConfig, githubUser, sourceStatus,
    sourceError, sourceBusy, refreshSource, activateSource, esp, target, hardware, hardwareBusy, setNotice,
    catalog, targetRecords, testDrafts, restoreWorkshop, repoToken, setRepoToken, repoTokenSaved, repoStorageMode,
    saveRepoAccess, removeRepoAccess, changeRememberRepo, repoDiagnostic, runRepoDiagnostic, repoDiagnosticBusy,
    startGithubLogin, githubLoginBusy, installTestCatalog, catalogSha, noticeHistory } = services;
  const [section, setSection] = useState('system'), [query, setQuery] = useState('');
  const [compiler, setCompiler] = useState(null), [system, setSystem] = useState(null), [cache, setCache] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [checkedAt, setCheckedAt] = useState(null);
  const [confirmation, setConfirmation] = useState(null), [pendingBackup, setPendingBackup] = useState(null);
  const fileInput = useRef(null), alive = useRef(true), actionBusy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const matching = sections.filter(s => `${s.title} ${s.hint}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  const selected = matching.find(s => s.id === section) || matching[0];
  const task = async work => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true); setMessage('');
    try { await work(); }
    catch (error) { if (alive.current) { setMessage(String(error?.message || error)); setNotice(`Ayar işlemi tamamlanamadı: ${String(error?.message || error)}`); } }
    finally { actionBusy.current = false; if (alive.current) setBusy(false); }
  };
  const inspectLocal = async () => {
    const [tool, info, snapshots] = await Promise.all([
      invoke('toolchain_status'), invoke('settings_system_info'), invoke('code_cache_info', { repository: githubConfig.repository }),
    ]);
    if (alive.current) { setCompiler(tool); setSystem(info); setCache(snapshots); }
  };
  useEffect(() => { task(inspectLocal); }, [githubConfig.repository]);
  const checkSystem = () => task(async () => {
    if (hardware.current) throw new Error('Donanım işlemi sürüyor; bittiğinde sistem kontrolünü çalıştır.');
    await inspectLocal(); await runRepoDiagnostic(); await refreshSource();
    if (!hardware.current) await services.refreshTarget();
    if (alive.current) { setCheckedAt(new Date().toLocaleTimeString('tr-TR')); setMessage('Kontrol tamamlandı. Her iş için hazırlık durumu aşağıda.'); }
  });
  const exportJson = async (kind, data) => {
    const content = JSON.stringify(redact(data), null, 2);
    if (window.__TAURI_INTERNALS__) {
      const path = await invoke('settings_export', { kind, content, directory: preferences.exportDirectory || null });
      setMessage(`Kaydedildi: ${path}`); setNotice(`Kaydedildi: ${path}`);
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `stardrop-${kind}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Dosya indirildi.');
    }
  };
  const profiles = Object.values(testDrafts).map(draft => draft.profile).filter(Boolean);
  const backup = () => task(() => exportJson('backup', makeBackup({ preferences, githubConfig, records: targetRecords, profiles })));
  const readBackup = file => task(async () => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) throw new Error('Yedek 4 MB sınırını aşıyor.');
    const data = parseBackup(await file.text()); setPendingBackup(data); setConfirmation('restore');
  });
  const retireCache = () => task(async () => {
    const lease = hardware.acquire('settings-cache', 'Kaynak önbelleği');
    try {
      const path = await invoke('code_cache_retire', { repository: githubConfig.repository });
      services.invalidateSource(); await inspectLocal(); setMessage(`Önbellek arşive taşındı: ${path}. Tekrar indirilebilir.`);
    } finally { hardware.release(lease); }
  });
  const report = () => task(async () => {
    await inspectLocal();
    const info = await invoke('settings_system_info'); const tool = await invoke('toolchain_status');
    await exportJson('diagnostic', { format: 'stardrop-diagnostic', version: 1, createdAt: new Date().toISOString(),
      system: info, compiler: tool, repository: githubConfig, sourceStatus, sourceError,
      github: { account, userStatus: repoDiagnostic?.userStatus, repositoryStatus: repoDiagnostic?.repositoryStatus, catalogStatus: repoDiagnostic?.catalogStatus },
      esp: { connected: esp.status, programmer: esp.programmer }, target: { connected: target?.connected, model: target?.model, uid: target?.uid },
      events: noticeHistory.slice(-50) });
  });
  const states = readiness({ compiler, sourceStatus, repositoryOk: repoDiagnostic?.repositoryStatus === 200, esp, target });
  return <div className="settings-hub">
    <header className="settings-hub-header"><h1>Ayarlar</h1><label className="settings-search"><Search size={15}/><input aria-label="Ayarlarda ara" placeholder="Ayarlarda ara" value={query} onChange={e => setQuery(e.target.value)}/></label></header>
    <div className="settings-hub-layout"><nav className="settings-sections" aria-label="Ayar bölümleri">{matching.map(s => <button key={s.id} className={selected?.id === s.id ? 'active' : ''} onClick={() => { setSection(s.id); setMessage(''); }}>{s.title}<ChevronRight size={13}/></button>)}</nav>
      <section className="settings-detail">{!selected ? <p>Bu aramada ayar bulunamadı.</p> : <><h2>{selected.title}</h2>
      {message && <p className="settings-feedback" role="status">{message}</p>}
      {selected.id === 'system' && <>
        <div className="settings-actions"><button className="primary" disabled={busy || Boolean(hardwareBusy)} onClick={checkSystem}>{busy ? 'KONTROL EDİLİYOR…' : 'SİSTEMİ KONTROL ET'}</button>{checkedAt && <small>Son kontrol {checkedAt}</small>}</div>
        <div className="settings-readiness">{states.map(s => <article key={s.label}><span className={s.ready ? 'ready' : ''}>{s.ready ? <Check size={14}/> : '○'} {s.label}</span><p>{s.detail}</p></article>)}</div>
        <Row title="Derleyici" description="Aynı araçlar yerel test derlemesinde kullanılır."><span>{compiler ? compiler.ready ? 'Hazır' : 'Eksik araç var' : 'Kontrol bekleniyor'}</span></Row>
        {compiler?.tools?.map(tool => <Row key={tool.name} title={tool.name} description={tool.ready ? tool.version : `${tool.error}. ARM GNU araçlarını kur veya gömülü toolchain’i hazırla.`}><span>{tool.ready ? '✓' : 'Eksik'}</span></Row>)}
        <Row title="ESP32 firmware" description={esp.programmer?.telemetryAvailable ? 'Canlı izleme desteği var.' : 'Canlı izleme için güncel ESP firmware’i gerekir.'}><span>{esp.status === 'online' ? 'Bağlı' : 'Bağlı değil'}</span></Row>
      </>}
      {selected.id === 'sources' && <>
        <Row title="GitHub hesabı"><button className="secondary" disabled={githubLoginBusy || Boolean(githubUser)} onClick={startGithubLogin}>{githubUser ? `@${githubUser.login}` : 'GİRİŞ YAP'}</button></Row>
        <Row title="Test deposu"><input aria-label="Test deposu" disabled={Boolean(hardwareBusy) || sourceBusy} value={githubConfig.repository} onChange={e => updateGithubConfig('repository', e.target.value)}/></Row>
        <Row title="Dal"><input aria-label="Kaynak dalı" disabled={Boolean(hardwareBusy) || sourceBusy} value={githubConfig.ref} onChange={e => updateGithubConfig('ref', e.target.value)}/></Row>
        <Row title="Depo anahtarı" description="Okuma: Contents Read. Paylaşım: Contents Read and write."><input aria-label="Depo anahtarı" type="password" autoComplete="off" value={repoToken} placeholder={repoTokenSaved ? 'Anahtar kayıtlı' : 'Fine-grained token'} onChange={e => setRepoToken(e.target.value)}/><button className="secondary" disabled={busy || !repoToken.trim() || Boolean(hardwareBusy)} onClick={() => task(saveRepoAccess)}>KAYDET</button></Row>
        <Row title="Bu bilgisayarda hatırla" description={repoTokenSaved ? repoStorageMode === 'os' ? 'Anahtar güvenli kasada; yeniden açınca kullanılacak.' : 'Anahtar yalnız oturum belleğinde. Kalıcı kasa kullanılamadı veya hatırlama kapalı.' : 'Anahtar hiçbir zaman düz metin dosyaya yazılmaz.'}><input type="checkbox" aria-label="Bu bilgisayarda hatırla" checked={preferences.rememberRepo} disabled={busy || Boolean(hardwareBusy)} onChange={e => task(() => changeRememberRepo(e.target.checked))}/></Row>
        <div className="settings-actions"><button className="secondary" disabled={busy || repoDiagnosticBusy || Boolean(hardwareBusy)} onClick={() => task(runRepoDiagnostic)}>ERİŞİMİ TEST ET</button>{repoTokenSaved && <button className="secondary" disabled={busy || Boolean(hardwareBusy)} onClick={() => setConfirmation('forget')}>ANAHTARI UNUT</button>}</div>
        {repoDiagnostic && <p className="settings-feedback">{repoDiagnostic.error || `Hesap: HTTP ${repoDiagnostic.userStatus} · Depo: HTTP ${repoDiagnostic.repositoryStatus} · Katalog: HTTP ${repoDiagnostic.catalogStatus}`}</p>}
        {repoDiagnostic?.repositoryStatus === 404 && <p>Bu kimlik özel depoyu göremiyor. Depoyu token kapsamına ekle veya GitHub App’i Contents izniyle kur.</p>}
        <Row title="Kullanılan kaynak" description={sourceStatus?.offline ? 'Doğrulanmış yerel kaynakla çevrimdışı derlenebilir.' : 'Yeni sürüm kendiliğinden etkinleştirilmez.'}><code title={sourceStatus?.activeSha}>{compact(sourceStatus?.activeSha)}</code></Row>
        <Row title="Son bulunan sürüm"><code title={sourceStatus?.latestSha}>{compact(sourceStatus?.latestSha)}</code></Row>
        {sourceError && <p className="settings-feedback">{sourceError}</p>}
        <div className="settings-actions"><button className="secondary" disabled={sourceBusy || busy || Boolean(hardwareBusy)} onClick={() => task(async () => { await refreshSource(); await inspectLocal(); })}>GÜNCELLEMELERİ KONTROL ET</button><button className="secondary" disabled={sourceBusy || busy || Boolean(hardwareBusy) || !sourceStatus?.latestSha || sourceStatus.latestSha === sourceStatus.activeSha} onClick={() => task(async () => { await activateSource(); await inspectLocal(); })}>SÜRÜMÜ İNDİR VE KULLAN</button></div>
        <Row title="Yerel önbellek" description="Yalnız bu deponun indirilmiş kaynakları. Temizleme kart kayıtlarına dokunmaz."><span>{cache?.snapshots?.length || 0} sürüm</span><button className="secondary" disabled={busy || Boolean(hardwareBusy) || !cache?.snapshots?.length} onClick={() => setConfirmation('cache')}>TEMİZLE</button></Row>
        {cache?.snapshots?.map(s => <Row key={s.sha} title={compact(s.sha)} description={s.active ? 'Etkin sürüm' : 'İndirilmiş sürüm'}><span>{s.verified ? 'Bütünlük doğrulandı' : 'Bozuk kaynak; kullanılamaz'}</span></Row>)}
        <Row title="Çevrimdışı hazırlanabilen testler" description="Kaynak doğrulanmışsa, desteklenen testler internet olmadan yerelde derlenebilir."><span>{sourceStatus?.activeSha ? catalog.tests.filter(t => t.status === 'ready').map(t => t.name).join(' · ') : 'Önce kaynak indir'}</span></Row>
        {githubUser && !catalogSha && <button className="secondary" disabled={busy || Boolean(hardwareBusy)} onClick={() => task(installTestCatalog)}>TEST KATALOĞUNU KUR</button>}
      </>}
      {selected.id === 'workshop' && <>
        <Row title="Atölye yedeği" description="Kart isimleri, son flash analizleri, bağlantı profilleri ve tercihler. Anahtarlar ve kaynak dosyaları dahil değildir."><button className="secondary" disabled={busy || Boolean(hardwareBusy)} onClick={backup}><Download size={14}/> YEDEK AL</button><button className="secondary" disabled={busy || Boolean(hardwareBusy)} onClick={() => fileInput.current?.click()}><Upload size={14}/> GERİ YÜKLE</button></Row>
        <input hidden ref={fileInput} type="file" accept=".json" onChange={e => { readBackup(e.target.files[0]); e.target.value = ''; }}/>
        <Row title="Kayıtlı kartlar"><span>{Object.keys(targetRecords).length} kart</span></Row>
        {Object.values(targetRecords).map(record => <Row key={record.uid} title={record.label || record.model} description={record.uid}><span>{record.flashAnalysis ? `Son analiz: ${new Date(record.flashAnalysis.analyzedAt).toLocaleString('tr-TR')}` : 'Flash analizi yok'}</span></Row>)}
        <Row title="Açık test profilleri" description="Geri yüklenen pinler güvenlik için yeniden onay ister."><span>{profiles.length} profil</span></Row>
      </>}
      {selected.id === 'measure' && <>
        <Row title="Varsayılan okuma aralığı"><Pick title="Varsayılan okuma aralığı" value={preferences.intervalMs} choices={[[250, '250 ms'], [500, '500 ms'], [1000, '1 saniye']]} change={v => updatePreferences({ intervalMs: Number(v) })}/></Row>
        <Row title="Kayıt sınırı" description="Yeni izleme oturumlarında uygulanır."><Pick title="Kayıt sınırı" value={preferences.recordLimit} choices={[[500, '500 örnek'], [1000, '1000 örnek'], [2000, '2000 örnek']]} change={v => updatePreferences({ recordLimit: Number(v) })}/></Row>
        <Row title="Kayıt klasörü" description={system?.exportDirectory ? `Boş bırakırsan: ${system.exportDirectory}` : 'Boş bırakıldığında uygulamanın exports klasörü kullanılır.'}><input aria-label="Kayıt klasörü" placeholder="Tam klasör yolu" value={preferences.exportDirectory} onChange={e => updatePreferences({ exportDirectory: e.target.value })}/></Row>
        <Row title="Sıcaklık birimi" description="Yalnız ekran değişir; CSV ham değeri ve birimi korur."><Pick title="Sıcaklık birimi" value={preferences.temperatureUnit} choices={['C', 'F'].map(v => [v, `°${v}`])} change={v => updatePreferences({ temperatureUnit: v })}/></Row>
        <Row title="Basınç birimi"><Pick title="Basınç birimi" value={preferences.pressureUnit} choices={['Pa', 'hPa', 'kPa'].map(v => [v, v])} change={v => updatePreferences({ pressureUnit: v })}/></Row>
      </>}
      {selected.id === 'security' && <>
        <Row title="Güvenilir test deposu" description="Başka depodan kod yüklemek için önce burada güvenilir olarak seç."><span>{preferences.trustedRepository || 'Seçilmedi'}</span><button className="secondary" disabled={Boolean(hardwareBusy) || preferences.trustedRepository === githubConfig.repository} onClick={() => setConfirmation('trust')}>BU DEPOYA GÜVEN</button></Row>
        {['Flash öncesi hedef UID kontrolü', 'Yazılım değiştirmeden önce onay', 'İndirilen kaynak bütünlüğü kontrolü', 'Telemetride ABI, CRC ve çalıştırma doğrulaması'].map(title => <Row key={title} title={title} description="Güvenlik kontrolü kapatılamaz."><ShieldCheck size={17}/> Zorunlu</Row>)}
        <Row title="Depo anahtarının saklanması"><span>{repoTokenSaved ? repoStorageMode === 'os' ? 'Kalıcı güvenli kasa' : 'Oturum belleği' : 'Anahtar yok'}</span></Row>
        <p className="settings-note">GitHub’dan çıkış, hatırlanan depo anahtarını silmez. Paylaşılan bilgisayarda “Anahtarı unut” kullan.</p>
      </>}
      {selected.id === 'appearance' && <>
        <Row title="Yazı boyutu"><Pick title="Yazı boyutu" value={preferences.fontScale} choices={[[1, 'Standart'], [1.1, 'Büyük'], [1.2, 'Daha büyük']]} change={v => updatePreferences({ fontScale: Number(v) })}/></Row>
        <Row title="Arayüz ölçeği"><Pick title="Arayüz ölçeği" value={preferences.uiScale} choices={[[0.9, '%90'], [1, '%100'], [1.1, '%110']]} change={v => updatePreferences({ uiScale: Number(v) })}/></Row>
        <Row title="Hareketi azalt"><input type="checkbox" aria-label="Hareketi azalt" checked={preferences.reducedMotion} onChange={e => updatePreferences({ reducedMotion: e.target.checked })}/></Row>
        <Row title="Giriş sonrası başlangıç ekranı"><Pick title="Başlangıç ekranı" value={preferences.startPage} choices={[["workbench", "Yeni Test"], ["flash", "Hızlı Yükleme"], ["library", "Test Kütüphanesi"], ["devices", "Cihazlar"], ["monitor", "Canlı İzleme"], ["empty", "Boş sekme"]]} change={v => updatePreferences({ startPage: v })}/></Row>
        <Row title="Tema"><span>Siyah · Michroma</span></Row>
      </>}
      {selected.id === 'diagnostics' && <>
        <Row title="Uygulama"><span>{system?.version || '—'} · {system?.os || '—'} · {system?.arch || '—'}</span></Row>
        <Row title="Hata raporu" description="Sürümler, durumlar ve son 50 bildirim. Anahtarlar ve yetkilendirme kodları gizlenir."><button className="secondary" disabled={busy || Boolean(hardwareBusy)} onClick={report}>RAPORU KAYDET</button></Row>
        <details className="settings-log"><summary>Son bildirimler</summary>{noticeHistory.slice(-20).map((entry, index) => <p key={index}>{redact(typeof entry === 'string' ? entry : entry.message || entry.text || JSON.stringify(entry))}</p>)}</details>
      </>}
      </>}</section></div>
    {confirmation && <Popup ariaLabel="Ayar işlemini onayla" onClose={() => { setConfirmation(null); setPendingBackup(null); }}>
      <h2>{confirmation === 'restore' ? 'Yedek geri yüklensin mi?' : confirmation === 'forget' ? 'Depo anahtarı unutulsun mu?' : confirmation === 'cache' ? 'Önbellek temizlensin mi?' : 'Bu depoya güveniyor musun?'}</h2>
      <p>{confirmation === 'restore' ? `${Object.keys(pendingBackup.records).length} kart ve ${pendingBackup.profiles.length} profil. Aynı UID kayıtları yedektekiyle güncellenir; diğer kartlar korunur. Tercihler değişir, pin onayları sıfırlanır.` : confirmation === 'cache' ? 'Bu deponun indirilmiş kaynakları arşive taşınır. Çevrimdışı derleme için yeniden indirmen gerekir.' : confirmation === 'trust' ? `${githubConfig.repository} kaynaklarını derleyip karta yüklemeyi kabul ediyorsun. Kaynağı ekip tarafından incele.` : 'Kalıcı kasadan ve oturum belleğinden silinir. Tekrar kullanmak için anahtar girmen gerekir.'}</p>
      <div className="settings-actions"><button className="secondary" onClick={() => { setConfirmation(null); setPendingBackup(null); }}>VAZGEÇ</button><button className="primary" disabled={busy || Boolean(hardwareBusy)} onClick={() => {
        const action = confirmation, backup = pendingBackup; setConfirmation(null); setPendingBackup(null);
        if (action === 'cache') retireCache();
        else task(async () => { if (action === 'restore') { await restoreWorkshop(backup); setMessage('Atölye yedeği geri yüklendi; profiller ayrı test sekmelerinde açıldı.'); }
          else if (action === 'forget') await removeRepoAccess();
          else updatePreferences({ trustedRepository: githubConfig.repository }); });
      }}>ONAYLA</button></div>
    </Popup>}
  </div>;
}
