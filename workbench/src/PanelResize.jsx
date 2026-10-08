import { useEffect, useRef, useState } from 'react';
import { panelWidth } from './lib/panelSize.js';
import './panel-resize.css';

export function usePanelWidth(key, options = {}) {
  const settings = { min: 180, max: 520, reserve: 360, fallback: 210, ...options };
  const storageKey = `stardrop.panel.${key}`;
  const [width, setWidth] = useState(() => {
    let saved; try { saved = localStorage.getItem(storageKey); } catch { /* storage is optional */ }
    return panelWidth(saved, { ...settings, viewport: window.innerWidth });
  });
  const change = value => setWidth(panelWidth(value, { ...settings, viewport: window.innerWidth }));
  const commit = value => { try { localStorage.setItem(storageKey, String(value)); } catch { /* keep the in-memory size */ } };
  useEffect(() => {
    const resize = () => setWidth(value => panelWidth(value, { ...settings, viewport: window.innerWidth }));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [settings.min, settings.max, settings.reserve]);
  return { width, change, commit, reset: () => { change(settings.fallback); commit(settings.fallback); }, min: settings.min, max: settings.max };
}

export default function PanelResize({ panel, side = 'right', label = 'Panel genişliği' }) {
  const drag = useRef(null), current = useRef(panel.width);
  current.current = panel.width;
  useEffect(() => {
    const cancel = () => { if (drag.current) { drag.current = null; delete document.body.dataset.panelResizing; panel.commit(current.current); } };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, []);
  const finish = event => {
    if (!drag.current || event.pointerId !== drag.current.id) return;
    drag.current = null; delete document.body.dataset.panelResizing;
    panel.commit(current.current);
  };
  return <div className={`panel-resize panel-resize-${side}`} role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuenow={panel.width} aria-valuemin={panel.min} aria-valuemax={panel.max} tabIndex={0}
    title="Sürükleyerek boyutlandır · çift tıkla sıfırla" onDoubleClick={panel.reset}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag.current = { id: event.pointerId, x: event.clientX, width: panel.width };
      event.currentTarget.setPointerCapture(event.pointerId); document.body.dataset.panelResizing = 'true';
    }} onPointerMove={event => {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      panel.change(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? -1 : 1));
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      if (event.key === 'Home') { event.preventDefault(); panel.reset(); }
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); const step = (event.shiftKey ? 32 : 8) * (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? -1 : 1);
        panel.change(panel.width + step); panel.commit(panel.width + step);
      }
    }}/>
}
