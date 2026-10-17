import { useLayoutEffect, useRef } from 'react';

const MOVE = 'transform .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1)';

export function useSlidingMarker(activeKey, enabled = true, layoutKey = '') {
  const ref = useRef(null);
  const markerRef = useRef(null);
  const last = useRef(null);

  useLayoutEffect(() => {
    const nav = ref.current;
    const marker = markerRef.current;
    if (!nav || !marker) return;

    let cancelled = false;
    let frame = 0;
    const active = enabled && activeKey
      ? Array.from(nav.querySelectorAll('[data-marker-key]')).find(button => button.dataset.markerKey === activeKey)
      : null;
    if (!active) {
      marker.hidden = true;
      last.current = null;
      return;
    }

    const measure = (selectionChanged) => {
      if (cancelled || !active.isConnected || active.dataset.markerKey !== activeKey) return;
      const top = active.offsetTop;
      const height = active.offsetHeight;
      if (!Number.isFinite(top) || height <= 0) return;
      const previous = last.current;
      if (previous?.top === top && previous.height === height && !marker.hidden) {
        last.current = { key: activeKey, layoutKey, top, height };
        return;
      }

      // Only selection changes slide. A resize or filtered list snaps directly
      // to its final position, never through a stale intermediate coordinate.
      const slide = selectionChanged && previous && previous.key !== activeKey
        && previous.layoutKey === layoutKey && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (slide) marker.getBoundingClientRect(); // Commit the current frame before changing the destination.
      marker.style.transition = slide ? MOVE : 'none';
      marker.style.setProperty('--ui-marker-y', `${top}px`);
      marker.style.setProperty('--ui-marker-height', `${height}px`);
      marker.hidden = false;
      last.current = { key: activeKey, layoutKey, top, height };
    };

    measure(true);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(false));
    });
    observer.observe(nav);
    observer.observe(active);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeKey, enabled, layoutKey]);

  return { ref, markerRef };
}

export function SlidingMarker({ markerRef }) {
  return <span ref={markerRef} className="ui-sliding-marker" hidden aria-hidden="true"/>;
}
