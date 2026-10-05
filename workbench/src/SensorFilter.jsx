import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import Popup from './Popup.jsx';
import { librarySensorChoices, SENSOR_GROUPS } from './lib/libraryFilters.js';

export default function SensorFilter({ entries, category, parts, onApply, onClose }) {
  const [group, setGroup] = useState(category);
  const [picked, setPicked] = useState(parts);
  const choices = useMemo(() => librarySensorChoices(entries), [entries]);
  const toggle = part => setPicked(current => current.includes(part) ? current.filter(item => item !== part) : [...current, part]);
  return <Popup className="sensor-filter-popup" ariaLabel="Sensör filtreleri" onClose={onClose}>
    <div className="sensor-filter-heading"><h2>Sensörler</h2><button className="icon-button" onClick={onClose} aria-label="Sensör filtrelerini kapat"><X size={17}/></button></div>
    <div className="sensor-filter-layout">
      <div className="sensor-filter-groups" aria-label="Sensör kategorileri">
        {[{ id: 'all', label: 'Tümü' }, ...SENSOR_GROUPS].map(item => <button key={item.id} aria-pressed={group === item.id} onClick={() => { setGroup(item.id); setPicked([]); }}>{item.label}</button>)}
      </div>
      <div className="sensor-filter-parts">
        {choices.filter(item => group === 'all' || item.group === group).map(item => <button key={item.part} role="checkbox" aria-checked={picked.includes(item.part)} onClick={() => toggle(item.part)}>
          <span className="sensor-filter-check">{picked.includes(item.part) && <Check size={13}/>}</span><strong>{item.part}</strong><small>{item.count ? `${item.count} kayıt` : 'Henüz kayıt yok'}</small>
        </button>)}
        {!choices.some(item => group === 'all' || item.group === group) && <p>Henüz sensör eklenmedi.</p>}
      </div>
    </div>
    <div className="sensor-filter-footer"><button className="wizard-text-button" onClick={() => { setGroup('all'); setPicked([]); }}>Temizle</button><button className="primary" onClick={() => { onApply(group, picked); onClose(); }}>UYGULA</button></div>
  </Popup>;
}
