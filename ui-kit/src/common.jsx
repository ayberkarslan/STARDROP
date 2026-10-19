import { forwardRef, useEffect, useId, useRef, useState } from 'react';

const join = (...parts) => parts.filter(Boolean).join(' ');

export const YRT_TextArea = forwardRef(function YRT_TextArea({ label, hint, error, id, className, ...props }, ref) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return <div className={join('sd-field', className)}>
    {label && <label className="sd-field__label" htmlFor={inputId}>{label}</label>}
    <textarea {...props} ref={ref} id={inputId} className="sd-field__input sd-field__textarea"
      aria-invalid={error ? true : undefined}
      aria-describedby={[props['aria-describedby'], hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}/>
    {hint && <small id={hintId} className="sd-field__hint">{hint}</small>}
    {error && <small id={errorId} className="sd-field__error" role="alert">{error}</small>}
  </div>;
});

export const YRT_Checkbox = forwardRef(function YRT_Checkbox({ label, hint, id, className, ...props }, ref) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = `${inputId}-hint`;
  return <div className={join('sd-checkbox', className)}>
    <input {...props} ref={ref} id={inputId} type="checkbox" className="sd-checkbox__input"
      aria-describedby={[props['aria-describedby'], hint && hintId].filter(Boolean).join(' ') || undefined}/>
    <div className="sd-checkbox__body">
      <label htmlFor={inputId} className="sd-checkbox__label">{label}</label>
      {hint && <small id={hintId} className="sd-checkbox__hint">{hint}</small>}
    </div>
  </div>;
});

export function YRT_EmptyState({ title, description, action, icon, className, ...props }) {
  return <div {...props} className={join('sd-empty', className)}>
    {icon && <div className="sd-empty__icon" aria-hidden="true">{icon}</div>}
    <h2 className="sd-empty__title">{title}</h2>
    {description && <p className="sd-empty__description">{description}</p>}
    {action && <div className="sd-empty__action">{action}</div>}
  </div>;
}

export function YRT_Tabs({ items, value, defaultValue, onChange, label = 'Sekmeler', className }) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.value);
  const selectedValue = value === undefined ? internalValue : value;
  const selectedIndex = Math.max(0, items.findIndex(item => item.value === selectedValue));
  const selected = items[selectedIndex];
  const refs = useRef([]);
  const select = index => {
    const next = items[index];
    if (!next || next.disabled) return;
    if (value === undefined) setInternalValue(next.value);
    onChange?.(next.value);
    refs.current[index]?.focus();
  };
  const onKeyDown = (event, index) => {
    const step = event.key === 'ArrowRight' || event.key === 'Home' ? 1
      : event.key === 'ArrowLeft' || event.key === 'End' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + step;
    for (let count = 0; count < items.length; count += 1) {
      const candidate = (target + step * count + items.length * 2) % items.length;
      if (!items[candidate].disabled) { select(candidate); break; }
    }
  };
  return <div className={join('sd-tabs', className)}>
    <div className="sd-tabs__list" role="tablist" aria-label={label}>
      {items.map((item, index) => <button key={item.value} ref={node => { refs.current[index] = node; }} type="button" role="tab"
        className="sd-tabs__tab" id={`${generatedId}-tab-${index}`} aria-controls={`${generatedId}-panel-${index}`}
        aria-selected={index === selectedIndex} tabIndex={index === selectedIndex ? 0 : -1}
        disabled={item.disabled} onClick={() => select(index)} onKeyDown={event => onKeyDown(event, index)}>{item.label}</button>)}
    </div>
    {selected && <div className="sd-tabs__panel" role="tabpanel" id={`${generatedId}-panel-${selectedIndex}`}
      aria-labelledby={`${generatedId}-tab-${selectedIndex}`} tabIndex={0}>{selected.content}</div>}
  </div>;
}

export function YRT_Dialog({ open, onClose, title, description, children, actions, className, closeLabel = 'Kapat' }) {
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    return () => { if (node.open) node.close(); };
  }, [open]);
  return <dialog ref={dialog} className={join('sd-dialog', className)} aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    onCancel={event => { event.preventDefault(); onClose?.(); }}
    onClick={event => { if (event.target === dialog.current) onClose?.(); }}>
    <div className="sd-dialog__header">
      <div><h2 id={titleId} className="sd-dialog__title">{title}</h2>
        {description && <p id={descriptionId} className="sd-dialog__description">{description}</p>}</div>
      <button type="button" className="sd-dialog__close" aria-label={closeLabel} onClick={onClose}>×</button>
    </div>
    <div className="sd-dialog__body">{children}</div>
    {actions && <div className="sd-dialog__actions">{actions}</div>}
  </dialog>;
}
