import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, CircleAlert, Clock3, Copy, Search, StickyNote } from 'lucide-react';
import { boardTimeline, listBoardJournals, listenBoardJournal, recordBoardEvent, updateBoardJournal } from './lib/boardJournal.js';
import { firmwareHistory } from './lib/watchMemory.js';
import { targetUid } from './lib/targetRegistry.js';
import { boardChoices, filterBoards } from './lib/boardFilters.js';
import SelectMenu from './SelectMenu.jsx';

const statusLabels = { unknown: 'Durum bilinmiyor', healthy: 'Çalışıyor', check: 'Kontrol gerekli', faulty: 'Arızalı olabilir' };
const eventLabels = { connected: 'BAĞLANTI', flash: 'YAZILIM', test: 'TEST', note: 'NOT', issue: 'DURUM', analysis: 'BELLEK' };
const date = value => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Henüz kayıt yok';

export default function BoardProfiles({ records, target, saveTargetName, setNotice }) {
  const [journals, setJournals] = useState({});
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [noteKind, setNoteKind] = useState('note');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const connectedUid = target?.connected ? targetUid(target.uid) : null;

  useEffect(() => {
    let active = true;
    const refresh = () => listBoardJournals().then(rows => {
      if (active) setJournals(Object.fromEntries(rows.map(row => [row.uid, row])));
    }).catch(e => { if (active) setError(`Kart kayıtları okunamadı: ${e.message}`); });
    refresh(); const unsubscribe = listenBoardJournal(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (connectedUid && !selected) setSelected(connectedUid);
  }, [connectedUid, selected]);
  useEffect(() => { setName(records[selected]?.label || ''); }, [selected, records]);
  useEffect(() => {
    const blob = journals[selected]?.photo;
    if (!blob) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected, journals]);

  const boards = useMemo(() => boardChoices(records, journals), [records, journals]);
  const modelOptions = [{ value: 'all', label: 'Tüm MCU’lar' }, ...[...new Set(boards.map(board => board.model).filter(Boolean))]
    .sort().map(model => ({ value: model, label: model }))];
  const statusOptions = [{ value: 'all', label: 'Tüm durumlar' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))];
  const filtered = filterBoards(boards, journals, { query, model: modelFilter, status: statusFilter });
  const record = records[selected] || null;
  const journal = journals[selected] || null;
  const timeline = boardTimeline(journal, selected ? firmwareHistory(selected) : [], record?.flashAnalysis);
  const active = selected && connectedUid === selected;

  const saveName = async () => {
    setSaving(true); setError('');
    try { await saveTargetName({ uid: selected, model: record?.model || target?.model || '' }, name); setNotice('Kart adı UID’ye kaydedildi.'); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const saveStatus = async status => {
    if (!selected || !statusLabels[status]) return;
    try {
      const title = `Durum: ${statusLabels[status]}`;
      await updateBoardJournal(selected, current => ({ ...current, status, events: [...current.events, {
        id: crypto.randomUUID(), kind: 'issue', title, detail: 'Elle işaretlendi; otomatik teşhis değildir.', at: Date.now(),
      }] }));
    } catch (e) { setError(e.message); }
  };
  const addNote = async event => {
    event.preventDefault(); if (!note.trim() || !selected) return;
    setSaving(true); setError('');
    try { await recordBoardEvent(selected, noteKind, noteKind === 'issue' ? 'Kontrol edilmesi gereken şüphe' : 'Atölye notu', note); setNote(''); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const changePhoto = async file => {
    if (!file || !selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError('PNG, JPEG veya WebP seç; dosya en fazla 4 MB olabilir.'); return;
    }
    try { await updateBoardJournal(selected, current => ({ ...current, photo: file })); setError(''); }
    catch (e) { setError(e.message); }
  };

  return <div className="board-profiles workspace">
    <header className="board-page-head"><div><h1>Kartlar</h1><p>Her kartın geçmişi, kendi UID’sinde.</p></div><span>{filtered.length}{filtered.length !== boards.length ? ` / ${boards.length}` : ''} kart</span></header>
    {error && <div className="board-error" role="alert">{error}</div>}
    <div className="board-layout">
      <aside className="board-list"><label className="board-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ad, model veya UID ara" aria-label="Kart ara"/></label>
        <div className="board-filters"><SelectMenu ariaLabel="MCU filtresi" value={modelFilter} options={modelOptions} onChange={setModelFilter}/><SelectMenu ariaLabel="Kart durumu filtresi" value={statusFilter} options={statusOptions} onChange={setStatusFilter}/></div>
        <div className="board-list-scroll">
        {filtered.length ? filtered.map(board => <button key={board.uid} className={'board-list-item' + (selected === board.uid ? ' selected' : '')} onClick={() => setSelected(board.uid)}>
          <span><strong>{board.label || board.model || 'İsimsiz kart'}</strong>{connectedUid === board.uid && <i title="Şu an bağlı"/>}</span>
          <small>{board.model || 'STM32'} · {board.uid.slice(-8).toUpperCase()}</small>
          <em>{date(journals[board.uid]?.lastSeenAt)}</em>
        </button>) : <div className="board-empty-list">{boards.length ? 'Filtreye uyan kart yok.' : 'Kart bağlandığında profili burada oluşur.'}</div>}
        </div>
      </aside>
      <main className="board-detail">{selected ? <>
        <div className="board-hero"><div className="board-photo">{photoUrl ? <img src={photoUrl} alt="Kart fotoğrafı"/> : <span>{(record?.label || record?.model || 'S').slice(0, 1).toUpperCase()}</span>}
          <label className="board-photo-pick" title="Fotoğraf ekle"><Camera size={17}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => changePhoto(e.target.files?.[0])}/></label></div>
          <div className="board-identity"><span className="eyebrow">KART PROFİLİ {active && '· BAĞLI'}</span><h2>{record?.label || record?.model || 'İsimsiz kart'}</h2><p>{record?.model || target?.model || 'Model bilinmiyor'}</p>
            <button className="board-uid" title="UID kopyala" onClick={() => navigator.clipboard.writeText(selected).then(() => setNotice('Kart UID’si kopyalandı.')).catch(e => setError(e.message))}>{selected.toUpperCase()} <Copy size={14}/></button></div>
        </div>
        <div className="board-facts"><span><Clock3 size={16}/> Son görüldü <strong>{active ? 'Şu an bağlı' : date(journal?.lastSeenAt)}</strong></span><span><StickyNote size={16}/> Kayıt <strong>{timeline.length}</strong></span><span><CircleAlert size={16}/> Durum <strong>{statusLabels[journal?.status || 'unknown']}</strong></span></div>
        <div className="board-edit"><label>İsim<input value={name} maxLength={32} onChange={e => setName(e.target.value)} placeholder="Karta isim ver"/></label><button disabled={saving || !name.trim() || name.trim() === record?.label} onClick={saveName}>Kaydet</button>
          <label>Durum<select value={journal?.status || 'unknown'} onChange={e => saveStatus(e.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        {!active && <p className="board-hint">Bu kart çevrimdışı. Profilini düzenleyebilir, donanım testini bağlandığında sürdürebilirsin.</p>}
        <section className="board-timeline"><div className="board-section-head"><h3>Zaman çizelgesi</h3><span>Yeni → eski</span></div>
          <form className="board-note-form" onSubmit={addNote}><textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="Bugün kartta ne denedin? Sonuç ve gözlemini yaz…" aria-label="Kart notu"/><div><select value={noteKind} onChange={e => setNoteKind(e.target.value)} aria-label="Kayıt türü"><option value="note">Not</option><option value="issue">Arıza şüphesi</option></select><button disabled={saving || !note.trim()}>Kaydet</button></div></form>
          {timeline.length ? timeline.map(event => <article className="board-event" key={event.id}><span className="board-event-dot"/><div><div className="board-event-top"><small>{eventLabels[event.kind] || 'KAYIT'}</small><time dateTime={new Date(event.at).toISOString()}>{date(event.at)}</time></div><strong>{event.title}</strong>{event.detail && <p>{event.detail}</p>}</div></article>)
            : <div className="board-timeline-empty"><Check size={20}/> Henüz olay yok. İlk atölye notunu ekle.</div>}
        </section>
      </> : <div className="board-no-selection">Bir kart seç veya STM32 bağla.</div>}</main>
    </div>
  </div>;
}
