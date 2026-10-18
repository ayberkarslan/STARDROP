import { forwardRef } from 'react';

const join = (...parts) => parts.filter(Boolean).join(' ');

export const Button = forwardRef(function Button({ children, variant = 'secondary', size = 'md', loading = false, disabled, className, type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={join('sd-button', `sd-button--${variant}`, `sd-button--${size}`, className)} disabled={disabled || loading} aria-busy={loading || undefined}>
    {children}
  </button>;
});

export const IconButton = forwardRef(function IconButton({ label, children, className, ...props }, ref) {
  return <Button {...props} ref={ref} className={join('sd-icon-button', className)} aria-label={label} title={props.title || label}>{children}</Button>;
});

export const ChoiceCard = forwardRef(function ChoiceCard({ children, className, type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={join('sd-choice-card', className)}>{children}</button>;
});
