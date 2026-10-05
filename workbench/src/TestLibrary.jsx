import { useMemo, useState } from 'react';
import { Minus, Plus, RefreshCw, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { filterLibrary, SENSOR_GROUPS } from './lib/libraryFilters.js';
import SelectMenu from './SelectMenu.jsx';
import SensorFilter from './SensorFilter.jsx';
import { catalogLibraryEntries } from './lib/testLibrary.js';

const resultLabel = { PASS: 'Başarılı', FAIL: 'Başarısız', NOT_RUN: 'Henüz denenmedi' };
const results = [{ value: 'all', label: 'Tüm sonuçlar' }, ...Object.entries(resultLabel).map(([value, label]) => ({ value, label }))];

export default function TestLibrary({ entries, catalog, busy, error, refresh, publish, drafts = {}, documents = [], openEntry, sourceSha, startNewTest }) {
  const allEntries = useMemo(() => [...entries, ...catalogLibraryEntries(catalog)], [entries, catalog]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [category, setCategory] = useState('all');
  const [parts, setParts] = useState([]);
  const [result, setResult] = useState('all');
  const [mcu, setMcu] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const availableDrafts = documents.filter(doc => drafts[doc.id]?.profile);
  const selectedDraftId = availableDrafts.some(doc => doc.id === draftId) ? draftId : availableDrafts.at(-1)?.id || '';
  const draft = drafts[selectedDraftId];
  const profile = draft?.profile;
  const activeSensor = profile?.components.find(component => component.ref === draft?.activeComponent);
  const selectedTest = draft?.selectedTest;
  const filtered = useMemo(() => filterLibrary(allEntries, { query, category, parts, result, mcu }), [allEntries, query, category, parts, result, mcu]);
  const selected = filtered.find(item => item.id === selectedId) || null;
  const mcuOptions = [{ value: 'all', label: 'Tüm kartlar' }, ...[...new Set(allEntries.flatMap(entry => entry.supportedMcu || [entry.board.mcu]))].sort().map(value => ({ value, label: value }))];
  const hasFilters = category !== 'all' || parts.length > 0 || result !== 'all' || mcu !== 'all';
  const clear = () => { setCategory('all'); setParts([]); setResult('all'); setMcu('all'); };
  const submit = async event => {
    event.preventDefault();
    const saved = await publish({ name, note, documentId: selectedDraftId });
    if (saved) { setName(''); setNote(''); setShowNote(false); clear(); setQuery(''); setSelectedId(saved.id); }
  };

  return <div className="workspace library-workspace library-refined">
    <div className="library-heading"><h2>Test Kütüphanesi</h2><button className="icon-button library-refresh" onClick={refresh} disabled={busy} aria-label="Test kütüphanesini yenile" title="Yenile"><RefreshCw size={17} className={busy ? 'library-refreshing' : ''}/></button></div>
    <div className="library-toolbar">
      <label className="library-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Test, sensör veya pin ara…" aria-label="Test kütüphanesinde ara"/></label>
      <button className={'secondary library-filter-trigger' + (category !== 'all' || parts.length ? ' active' : '')} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={15}/>Sensörler{parts.length > 0 && <span>{parts.length}</span>}</button>
      <SelectMenu ariaLabel="Test sonucu filtresi" value={result} options={results} onChange={setResult}/>
      <SelectMenu ariaLabel="Mikrodenetleyici filtresi" value={mcu} options={mcuOptions} onChange={setMcu}/>
    </div>
    {hasFilters && <div className="library-filter-tags">
      {category !== 'all' && <button onClick={() => setCategory('all')}>{SENSOR_GROUPS.find(group => group.id === category)?.label}<X size={12}/></button>}
      {parts.map(part => <button key={part} onClick={() => setParts(current => current.filter(item => item !== part))}>{part}<X size={12}/></button>)}
      <button className="library-filter-clear" onClick={clear}>Filtreleri temizle</button>
    </div>}
    {error && <p className="validation warn" role="alert">{error}</p>}
    <div className="library-layout">
      <div className="library-browse">
        <div className="library-count"><span>{filtered.length} kayıt</span>{selected && <button className="wizard-text-button" onClick={() => setSelectedId(null)}>Listeye dön</button>}</div>
        {selected ? <article className="library-detail library-record">
          <div className="library-record-heading"><h2>{selected.name}</h2><span className={'library-result result-' + selected.result.status.toLowerCase()}>{selected.kind === 'template' ? 'Kod hazır' : resultLabel[selected.result.status]}</span></div>
          {selected.note && <p className="library-record-note">{selected.note}</p>}
          <div className="library-facts">
            <div><small>Kart</small><strong>{selected.board.name}</strong><span>{selected.board.mcu}</span></div>
            <div><small>Modül</small><strong>{selected.component.part}</strong><span>{selected.component.ref} · {selected.component.protocol}</span></div>
            <div><small>Test kodu</small><strong>{selected.test.name}</strong><span>{selected.test.id || 'Kod bekleniyor'}</span></div>
            <div><small>Son deneme</small><span>{selected.result.at ? new Date(selected.result.at).toLocaleString('tr-TR') : 'Henüz denenmedi'}</span></div>
          </div>
          <h3>Pinler</h3>{selected.kind === 'template' ? <p>Kartını ve pinlerini Yeni Test adımlarında seç. Kod GitHub’dan indirilip bu ayarlarla derlenir.</p> : <div className="library-pins">{selected.pins.map(pin => <div key={pin.role}><span>{selected.component.ref} · {pin.role}</span><strong>{pin.mcuPin}</strong><small>{pin.peripheral}</small></div>)}</div>}
          {selected.kind !== 'template' && <details className="library-record-meta"><summary>Kayıt bilgileri</summary><p className="library-meta">@{selected.author || 'ekip'} · {new Date(selected.publishedAt).toLocaleString('tr-TR')}<br/>Kaynak commit: {selected.test.sourceSha || 'hazır kod yok'}</p></details>}
          {selected.test.sourceSha && sourceSha && selected.test.sourceSha !== sourceSha && <p className="validation warn">Kod sürümü değişmiş. Pinleri ve kaynağı yeniden kontrol et.</p>}
          <button className="primary" onClick={() => openEntry(selected)}>YENİ TESTTE AÇ</button><small className="library-open-note">Yüklemeden önce hedef ve pinler yeniden onaylanır.</small>
        </article> : <div className="library-results">
          {filtered.map(entry => <button className="library-card" key={entry.id} onClick={() => setSelectedId(entry.id)}>
            <span className="library-card-head"><strong>{entry.name}</strong><em className={'result-' + entry.result.status.toLowerCase()}>{entry.kind === 'template' ? 'Kod hazır' : resultLabel[entry.result.status]}</em></span>
            <span>{entry.component.part} · {entry.test.name}</span><small>{entry.board.name} · {entry.board.mcu}</small><small>{entry.kind === 'template' ? 'GitHub · kaynak kodu' : `@${entry.author || 'ekip'} · ${new Date(entry.publishedAt).toLocaleDateString('tr-TR')}`}</small>
          </button>)}
          {!busy && filtered.length === 0 && <div className="library-empty-state"><Search size={26}/><h3>{query || hasFilters ? 'Eşleşen kayıt yok' : 'Henüz kayıt yok'}</h3><p>{query || hasFilters ? 'Filtreleri değiştirerek tekrar ara.' : 'İlk test düzenini ekibinle paylaş.'}</p>{(query || hasFilters) && <button className="wizard-text-button" onClick={() => { clear(); setQuery(''); }}>Aramayı temizle</button>}</div>}
          {busy && !filtered.length && <p className="library-empty" role="status">Yükleniyor…</p>}
        </div>}
      </div>
      <aside className="library-share" aria-label="Düzeni ekiple paylaş">
        <div className="library-share-heading"><Upload size={17}/><h3>Ekiple paylaş</h3></div>
        <form className="library-publish-form" onSubmit={submit}>
          {availableDrafts.length > 0 ? <label>Çalışma<SelectMenu ariaLabel="Paylaşılacak çalışma" value={selectedDraftId} options={availableDrafts.map((doc, index) => ({ value: doc.id, label: drafts[doc.id].profile.name + ' · ' + (drafts[doc.id].selectedTest?.name || 'Yeni Test') + ' (' + (index + 1) + ')' }))} onChange={setDraftId}/></label>
            : <div className="library-no-draft"><p>Önce bir çalışma oluştur.</p><button type="button" className="secondary" onClick={startNewTest}><Plus size={14}/>Yeni Test</button></div>}
          <label>Kayıt adı<input maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Örn. BlackPill · LED"/></label>
          <button type="button" className="wizard-text-button library-note-toggle" aria-expanded={showNote} onClick={() => setShowNote(current => !current)}>{showNote ? <Minus size={13}/> : <Plus size={13}/>} {showNote ? 'Notu gizle' : note ? 'Notu düzenle' : 'Not ekle'}</button>
          {showNote && <label>Atölye notu<textarea maxLength={2000} rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="Besleme, bağlantı veya deneme notu…"/></label>}
          {profile && <div className="library-preview"><span>{profile.mcu.part} · {activeSensor?.part || 'Bileşen seçilmedi'}</span><small>{selectedTest?.name || 'Kod bekleniyor'}</small></div>}
          <button type="submit" className="primary" disabled={busy || !profile || !activeSensor || name.trim().length < 3}>{busy ? 'KAYDEDİLİYOR…' : 'GITHUB’A KAYDET'}</button>
          <small className="library-share-hint">Pinler ve test sonucu otomatik eklenir.</small>
        </form>
      </aside>
    </div>
    {filterOpen && <SensorFilter entries={allEntries} category={category} parts={parts} onApply={(group, selectedParts) => { setCategory(group); setParts(selectedParts); setSelectedId(null); }} onClose={() => setFilterOpen(false)}/>}
  </div>;
}
