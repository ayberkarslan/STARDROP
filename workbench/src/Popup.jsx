import { useEffect, useRef } from 'react';
import PanelResize, { usePanelWidth } from './PanelResize.jsx';

export function usePopupDismiss(root, open, onClose, additionalRoot) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target) && !additionalRoot?.current?.contains(event.target)) close.current?.(); };
    const escape = (event) => { if (event.key === 'Escape' && !event.defaultPrevented) close.current?.(); };
    const tabChange = () => close.current?.();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('stardrop-tab-change', tabChange);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('stardrop-tab-change', tabChange);
    };
  }, [root, open, additionalRoot]);
}

export default function Popup({ children, onClose, labelledBy, ariaLabel, className = '', variant = 'dialog' }) {
  const size = usePanelWidth('drawer', { min: 300, max: 900, reserve: 24, fallback: 430 });
  const root = useRef(null);
  usePopupDismiss(root, true, onClose);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const elements = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')]
      .filter((element) => element.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); root.current.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
  };
  return <div className={`ui-popup-backdrop ui-popup-${variant}`} role="presentation">
    <section ref={root} className={`ui-popup ${className}`} style={variant === 'drawer' ? { width: size.width, maxWidth: 'calc(100vw - 24px)' } : undefined} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={ariaLabel} tabIndex={-1} onKeyDown={trapFocus}>
      {variant === 'drawer' && <PanelResize panel={size} side="left" label="Yan panel genişliği"/>}
      {children}
    </section>
  </div>;
}
