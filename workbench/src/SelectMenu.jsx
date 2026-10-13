import { useId, useRef, useState } from 'react';
import { usePopupDismiss } from './Popup.jsx';

export default function SelectMenu({ value, options, onChange, ariaLabel, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const root = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = options.find((option) => option.value === value);
  const visible = searchable && search ? options.filter(option => String(option.searchText || option.label).toLowerCase().includes(search.toLowerCase())) : options;

  usePopupDismiss(root, open, () => setOpen(false));

  const move = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); root.current?.querySelector('.select-trigger')?.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!open) { setOpen(true); requestAnimationFrame(() => list.current?.querySelector('[aria-selected="true"]')?.focus()); return; }
    const choices = [...(list.current?.querySelectorAll('.select-option') || [])];
    if (!choices.length) return;
    const current = choices.indexOf(document.activeElement);
    const next = current < 0 ? choices.findIndex((choice) => choice.getAttribute('aria-selected') === 'true')
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
    choices[Math.max(0, next)]?.focus();
  };

  return <div className={`select-menu${open ? ' open' : ''}`} ref={root} onKeyDown={move}>
    <button type="button" className="select-trigger" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen((current) => !current)}>{selected?.label || value || 'Seç'}<span aria-hidden="true">⌄</span></button>
    {open && <div className="select-options" ref={list}>
      {searchable && <input className="select-search" aria-label={`${ariaLabel} içinde ara`} placeholder="Ad veya adres ara" value={search} onChange={event => setSearch(event.target.value)}/>}
      <div id={id} role="listbox" aria-label={ariaLabel}>{visible.map((option) => <button type="button" className="select-option" role="option" aria-selected={option.value === value}
        key={option.value} onClick={() => { onChange(option.value); setOpen(false); root.current?.querySelector('.select-trigger')?.focus(); }}>{option.label}</button>)}
      {!visible.length && <p className="select-empty">Eşleşme yok</p>}</div>
    </div>}
  </div>;
}
