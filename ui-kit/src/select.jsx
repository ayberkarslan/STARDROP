import { useEffect, useId, useRef, useState } from 'react';

export function YRT_SelectMenu({ value, options, onChange, label, placeholder = 'Seç', searchable = false, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const listId = useId();
  const selected = options.find(option => option.value === value);
  const visible = searchable && search
    ? options.filter(option => String(option.searchText || option.label).toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === 'Escape' && root.current?.contains(document.activeElement)) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const focusOption = index => {
    const buttons = [...(list.current?.querySelectorAll('[role="option"]') || [])];
    if (buttons.length) buttons[(index + buttons.length) % buttons.length].focus();
  };
  const handleKeys = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => focusOption(Math.max(0, visible.findIndex(option => option.value === value))));
      return;
    }
    const buttons = [...(list.current?.querySelectorAll('[role="option"]') || [])];
    const index = buttons.indexOf(document.activeElement);
    focusOption(event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
  };

  return <div ref={root} className={`sd-select ${className}`} onKeyDown={handleKeys}>
    <button ref={trigger} type="button" className="sd-select__trigger" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-controls={listId} aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)}>
      <span>{selected?.label || placeholder}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div ref={list} className="sd-select__popup">
      {searchable && <input className="sd-select__search" aria-label={`${label || placeholder} içinde ara`} value={search} onChange={event => setSearch(event.target.value)}/>}
      <div id={listId} role="listbox" aria-label={label}>{visible.map(option => <button key={option.value} type="button" role="option" className="sd-select__option"
        aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); setSearch(''); trigger.current?.focus(); }}>{option.label}</button>)}
        {!visible.length && <div className="sd-select__empty">Eşleşme yok</div>}
      </div>
    </div>}
  </div>;
}
