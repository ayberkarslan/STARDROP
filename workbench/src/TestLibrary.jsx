import { useMemo, useState } from 'react';
import { RefreshCw, Search, Upload } from 'lucide-react';
import { searchLibrary } from './lib/testLibrary.js';
import SelectMenu from './SelectMenu.jsx';

const resultLabel = { PASS: 'BAŞARILI', FAIL: 'BAŞARISIZ', NOT_RUN: 'HENÜZ DENENMEDİ' };

export default function TestLibrary({ entries, busy, error, refresh, publish, drafts = {}, documents = [], openEntry, sourceSha, startNewTest }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [draftId, setDraftId] = useState('');
  const availableDrafts = documents.filter((doc) => drafts[doc.id]?.profile);
  const selectedDraftId = draftId || availableDrafts.at(-1)?.id || '';
  const draft = drafts[selectedDraftId];
  const profile = draft?.profile;
  const activeSensor = profile?.components.find((component) => component.ref === draft?.activeComponent);
  const selectedTest = draft?.selectedTest;
  const filtered = useMemo(() => searchLibrary(entries, query), [entries, query]);
  const selected = entries.find((item) => item.id === selectedId) || null;

  const submit = async () => {
    const saved = await publish({ name, note, documentId: selectedDraftId });
    if (saved) { setName(''); setNote(''); setSelectedId(saved.id); }
  };

  return <div className="workspace library-workspace">
    <div className="library-heading"><div><span className="eyebrow">EKİP HAFIZASI</span><h2>Test Kütüphanesi</h2><p>Kart, modül, pin veya test adıyla ara. Her kayıt bağlantı tarifi ve test sonucunu birlikte gösterir.</p></div><button className="secondary" onClick={refresh} disabled={busy}><RefreshCw size={15}/>{busy ? 'YÜKLENİYOR…' : 'YENİLE'}</button></div>
    <label className="library-search"><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Örn. RFM98W F446RE SPI ya da PC13" aria-label="Test kütüphanesinde ara"/></label>
    {error && <p className="validation warn" role="alert">{error}</p>}
    {!profile && <div className="library-create-hint"><span>Yeni bir kayıt için önce kartı ve bileşeni tanımla. Test çalışmamış olsa da bağlantı düzenini paylaşabilirsin.</span><button className="secondary" onClick={startNewTest}>YENİ TEST OLUŞTUR</button></div>}
    <div className="library-layout"><div className="library-results">{filtered.map((entry) => <button className={`library-card ${selected?.id === entry.id ? 'selected' : ''}`} key={entry.id} onClick={() => setSelectedId(entry.id)}><span className="library-card-head"><strong>{entry.name}</strong><em className={`result-${entry.result.status.toLowerCase()}`}>{resultLabel[entry.result.status]}</em></span><small>{entry.board.name} · {entry.board.mcu}</small><span>{entry.component.part} · {entry.test.name}</span><small>@{entry.author || 'ekip'} · {new Date(entry.publishedAt).toLocaleDateString('tr-TR')}</small></button>)}{!busy && filtered.length === 0 && <p className="library-empty">{query ? 'Bu aramayla eşleşen test düzeni yok.' : 'Henüz test düzeni paylaşılmamış.'}</p>}</div>
      <div className="library-detail">{selected ? <><button className="wizard-text-button" onClick={() => setSelectedId(null)}>+ YENİ KAYIT</button><span className="eyebrow">TEST DÜZENİ</span><h2>{selected.name}</h2><p>{selected.note || 'Ek not girilmemiş.'}</p><div className="library-facts"><div><small>KART</small><strong>{selected.board.name}</strong><span>{selected.board.mcu}</span></div><div><small>MODÜL</small><strong>{selected.component.part}</strong><span>{selected.component.ref} · {selected.component.protocol}</span></div><div><small>KOD</small><strong>{selected.test.name}</strong><span>{selected.test.id || "Hazır test kodu yok"}</span></div><div><small>SONUÇ</small><strong>{resultLabel[selected.result.status]}</strong><span>{selected.result.at ? new Date(selected.result.at).toLocaleString('tr-TR') : 'Fiziksel test kaydı yok'}</span></div></div><h3>Bağlantılar</h3><div className="library-pins">{selected.pins.map((pin) => <div key={pin.role}><span>{selected.component.ref} · {pin.role}</span><strong>{pin.mcuPin}</strong><small>{pin.peripheral}</small></div>)}</div><p className="library-meta">Kaydeden @{selected.author || 'ekip'} · {new Date(selected.publishedAt).toLocaleString('tr-TR')}<br/>Kaynak commit: {selected.test.sourceSha || 'hazır kod yok'}</p>{selected.test.sourceSha && sourceSha && selected.test.sourceSha !== sourceSha && <p className="validation warn">Kod kaynağının güncel sürümü bu kayıttakinden farklı. Yeniden denerken kodu ve pinleri kontrol et.</p>}<button className="primary" onClick={() => openEntry(selected)}>BU DÜZENİ WORKBENCH’TE AÇ</button><p className="library-meta">Açmak STM32’ye kod yüklemez. Pinleri ve hedefi yeniden onaylaman gerekir.</p></> : <><span className="eyebrow">YENİ KAYIT</span><h2>Düzeni ekiple paylaş</h2><p>İsim ve isteğe bağlı bir not gir. Kart, bileşen, pinler, test kodu ve son doğrulanmış sonuç otomatik yazılır.</p><div className="library-publish-form"><label>Paylaşılacak çalışma<SelectMenu ariaLabel="Paylaşılacak çalışma" value={selectedDraftId} options={availableDrafts.map((doc, index) => ({ value: doc.id, label: `${drafts[doc.id].profile.name} · ${drafts[doc.id].selectedTest?.name || 'Yeni Test'} (${index + 1})` }))} onChange={setDraftId}/></label><label>Kayıt adı<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Nucleo F446RE + RFM98W SPI"/></label><label>Atölye notu<textarea maxLength={2000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Örn. Modül 3.3 V ile beslendi; anten takılıydı."/></label><div className="library-preview"><span>{profile?.name || 'Kart seçilmedi'} · {profile?.mcu?.part || '—'}</span><span>{activeSensor?.part || 'Bileşen seçilmedi'} · {selectedTest?.name || 'Kod bekleniyor'}</span></div><button className="primary" onClick={submit} disabled={busy || !profile || !activeSensor}><Upload size={16}/>GITHUB’A KAYDET</button><small>Kaydın bilgi dosyası otomatik oluşturulur. Fiziksel test yapılmadıysa durum “Henüz denenmedi” olur.</small></div></>}</div>
    </div>
  </div>;
}
