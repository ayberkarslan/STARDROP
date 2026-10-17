import { useLayoutEffect, useRef } from 'react';

export function useSlidingMarker(activeKey, enabled = true, layoutKey = '') {
  const ref = useRef(null);
  const markerRef = useRef(null);
  const last = useRef(null);
  const animationRef = useRef(null);

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
      animationRef.current?.cancel();
      animationRef.current = null;
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

      // Read the position currently on screen, including an unfinished move.
      // The final CSS position is written before animating, so completion
      // cannot briefly restore the old coordinate.
      const slide = selectionChanged && previous && previous.key !== activeKey
        && previous.layoutKey === layoutKey && !marker.hidden
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const markerRect = slide ? marker.getBoundingClientRect() : null;
      const navRect = slide ? nav.getBoundingClientRect() : null;
      const fromTop = markerRect ? markerRect.top - navRect.top + nav.scrollTop : top;
      const fromHeight = markerRect?.height ?? height;
      animationRef.current?.cancel();
      animationRef.current = null;
      marker.style.setProperty('--ui-marker-y', `${top}px`);
      marker.style.setProperty('--ui-marker-height', `${height}px`);
      marker.hidden = false;
      last.current = { key: activeKey, layoutKey, top, height };
      if (slide && marker.animate && (Math.abs(fromTop - top) > .5 || Math.abs(fromHeight - height) > .5)) {
        const animation = marker.animate([
          { transform: `translateY(${fromTop}px)`, height: `${fromHeight}px` },
          { transform: `translateY(${top}px)`, height: `${height}px` },
        ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
        animationRef.current = animation;
        animation.onfinish = () => { if (animationRef.current === animation) animationRef.current = null; };
      }
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
