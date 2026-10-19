import { useState } from 'react';
import { YRT_Button, YRT_Checkbox, YRT_Dialog, YRT_EmptyState, YRT_Panel,
  YRT_StatusBadge, YRT_Tabs, YRT_TextArea, YRT_TextField } from '@stardrop/ui';

const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

export default function App() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [important, setImportant] = useState(false);
  const monthLabel = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(month);
  const firstWeekday = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + count }, (_, index) => index - firstWeekday + 1);
  const selectedEvents = events.filter(event => event.date === selected);
  const moveMonth = offset => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const save = () => {
    if (!title.trim()) return;
    setEvents(current => [...current, { date: selected, title: title.trim(), notes: notes.trim(), important }]);
    setTitle(''); setNotes(''); setImportant(false); setOpen(false);
  };

  const eventList = list => list.length ? <div className="starter-events">{list.map((event, index) =>
    <div className="starter-event" key={`${event.date}-${index}`}>
      <div><strong>{event.title}</strong><small>{event.date}{event.notes ? ` · ${event.notes}` : ''}</small></div>
      {event.important && <YRT_StatusBadge tone="warning">Önemli</YRT_StatusBadge>}
    </div>)}</div> : <YRT_EmptyState title="Henüz etkinlik yok" description="Seçili güne ilk etkinliğini ekle."
    action={<YRT_Button onClick={() => setOpen(true)}>Etkinlik ekle</YRT_Button>}/>;

  return <main className="starter">
    <header className="starter-header"><span>YRT UI</span><YRT_StatusBadge tone="success">Takvim örneği</YRT_StatusBadge></header>
    <h1>Takvim</h1><p className="starter-intro">Genel amaçlı bileşenlerle oluşturulmuş bağımsız örnek. Veriler yalnız bu oturumda tutulur.</p>
    <YRT_Panel title={monthLabel} action={<div className="starter-actions">
      <YRT_Button size="sm" onClick={() => moveMonth(-1)} aria-label="Önceki ay">←</YRT_Button>
      <YRT_Button size="sm" onClick={() => moveMonth(1)} aria-label="Sonraki ay">→</YRT_Button>
      <YRT_Button variant="primary" onClick={() => setOpen(true)}>Etkinlik ekle</YRT_Button>
    </div>}>
      <YRT_Tabs label="Takvim görünümü" items={[
        { value: 'calendar', label: 'Ay görünümü', content: <>
          <div className="starter-calendar">{days.map(day => <div className="starter-day-label" key={day}>{day}</div>)}
            {cells.map((day, index) => day > 0 ? <button type="button" key={index}
              className={`starter-day${dateKey(new Date(month.getFullYear(), month.getMonth(), day)) === selected ? ' is-selected' : ''}`}
              aria-pressed={dateKey(new Date(month.getFullYear(), month.getMonth(), day)) === selected}
              onClick={() => setSelected(dateKey(new Date(month.getFullYear(), month.getMonth(), day)))}>
              <span>{day}</span>{events.some(event => event.date === dateKey(new Date(month.getFullYear(), month.getMonth(), day))) && <i aria-label="Etkinlik var"/>}
            </button> : <div className="starter-day-spacer" key={index}/>)}
          </div><h2 className="starter-section-title">{selected} · etkinlikler</h2>{eventList(selectedEvents)}</> },
        { value: 'list', label: 'Tüm etkinlikler', content: eventList(events) },
      ]}/>
    </YRT_Panel>
    <YRT_Dialog open={open} onClose={() => setOpen(false)} title="Yeni etkinlik" description={`${selected} tarihine eklenecek.`}
      actions={<><YRT_Button onClick={() => setOpen(false)}>Vazgeç</YRT_Button><YRT_Button variant="primary" disabled={!title.trim()} onClick={save}>Kaydet</YRT_Button></>}>
      <div className="starter-form">
        <YRT_TextField label="Etkinlik adı" value={title} onChange={event => setTitle(event.target.value)} placeholder="Örn. ekip toplantısı"/>
        <YRT_TextArea label="Not" value={notes} onChange={event => setNotes(event.target.value)} placeholder="İsteğe bağlı"/>
        <YRT_Checkbox label="Önemli olarak işaretle" checked={important} onChange={event => setImportant(event.target.checked)}/>
      </div>
    </YRT_Dialog>
  </main>;
}
