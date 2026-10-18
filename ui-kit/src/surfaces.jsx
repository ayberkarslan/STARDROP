import { forwardRef, useId } from 'react';

const join = (...parts) => parts.filter(Boolean).join(' ');

export function YRT_Panel({ title, description, action, children, className, as: Element = 'section', ...props }) {
  return <Element {...props} className={join('sd-panel', className)}>
    {(title || description || action) && <div className="sd-panel__header">
      <div>{title && <h2 className="sd-panel__title">{title}</h2>}{description && <p className="sd-panel__description">{description}</p>}</div>
      {action && <div className="sd-panel__action">{action}</div>}
    </div>}
    {children}
  </Element>;
}

export function YRT_StatusBadge({ children, tone = 'neutral', className, ...props }) {
  return <span {...props} className={join('sd-status', `sd-status--${tone}`, className)}>{children}</span>;
}

export function YRT_Disclosure({ title, children, className, ...props }) {
  return <details {...props} className={join('sd-disclosure', className)}>
    <summary className="sd-disclosure__summary">{title}</summary>
    <div className="sd-disclosure__content">{children}</div>
  </details>;
}

export const YRT_TextField = forwardRef(function YRT_TextField({ label, hint, error, id, className, ...props }, ref) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return <div className={join('sd-field', className)}>
    {label && <label className="sd-field__label" htmlFor={inputId}>{label}</label>}
    <input {...props} ref={ref} id={inputId} className="sd-field__input" aria-invalid={error ? true : undefined}
      aria-describedby={[props['aria-describedby'], hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}/>
    {hint && <small id={hintId} className="sd-field__hint">{hint}</small>}
    {error && <small id={errorId} className="sd-field__error" role="alert">{error}</small>}
  </div>;
});
