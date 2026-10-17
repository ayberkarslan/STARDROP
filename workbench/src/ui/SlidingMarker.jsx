import { useLayoutEffect, useRef, useState } from 'react';

export function useSlidingMarker(activeKey, enabled = true, layoutKey = '') {
  const ref = useRef(null);
  const [marker, setMarker] = useState(null);

  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav || !enabled || !activeKey) { setMarker(null); return; }
    const active = Array.from(nav.querySelectorAll('[data-marker-key]')).find(button => button.dataset.markerKey === activeKey);
    if (!active) { setMarker(null); return; }
    const measure = () => setMarker(previous => {
      const top = active.offsetTop;
      const height = active.offsetHeight;
      if (previous?.top === top && previous.height === height) return previous;
      return { top, height, animate: previous !== null };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeKey, enabled, layoutKey]);

  return { ref, marker };
}

export function SlidingMarker({ marker }) {
  if (!marker) return null;
  return <span className="ui-sliding-marker" style={{ '--ui-marker-y': `${marker.top}px`, '--ui-marker-height': `${marker.height}px`, transition: marker.animate ? undefined : 'none' }} aria-hidden="true"/>;
}
