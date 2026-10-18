import { forwardRef } from 'react';

const join = (...parts) => parts.filter(Boolean).join(' ');

export const YRT_Button = forwardRef(function YRT_Button({ children, variant = 'secondary', size = 'md', loading = false, disabled, className, type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={join('sd-button', `sd-button--${variant}`, `sd-button--${size}`, className)} disabled={disabled || loading} aria-busy={loading || undefined}>
    {children}
  </button>;
});

export const YRT_IconButton = forwardRef(function YRT_IconButton({ label, children, className, ...props }, ref) {
  return <YRT_Button {...props} ref={ref} className={join('sd-icon-button', className)} aria-label={label} title={props.title || label}>{children}</YRT_Button>;
});

export const YRT_ChoiceCard = forwardRef(function YRT_ChoiceCard({ children, className, type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={join('sd-choice-card', className)}>{children}</button>;
});
