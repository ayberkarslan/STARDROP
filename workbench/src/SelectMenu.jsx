import { useEffect, useId, useRef, useState } from 'react';

export default function SelectMenu({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const move = (event) => {
    if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('.select-trigger')?.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
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
    {open && <div className="select-options" id={id} role="listbox" ref={list} aria-label={ariaLabel}>
      {options.map((option) => <button type="button" className="select-option" role="option" aria-selected={option.value === value}
        key={option.value} onClick={() => { onChange(option.value); setOpen(false); root.current?.querySelector('.select-trigger')?.focus(); }}>{option.label}</button>)}
    </div>}
  </div>;
}
