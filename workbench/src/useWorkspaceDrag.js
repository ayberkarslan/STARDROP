import { useEffect, useRef, useState } from 'react';

export default function useWorkspaceDrag(options) {
  const current = useRef(options);
  current.current = options;
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const cancel = () => { gesture.current = null; setPreview(null); };
    const targetAt = (event) => {
      const { workspace } = current.current;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const tab = element?.closest('[data-drop-tab]');
      if (tab) return tab.dataset.dropTab;
      const panel = element?.closest('[data-drop-document]');
      if (panel) return workspace.state.tabs.find((item) => item.documentId === panel.dataset.dropDocument)?.id;
      if (element?.closest('[data-drop-empty]')) return workspace.state.activeId || 'new';
      return null;
    };
    const move = (event) => {
      const item = gesture.current;
      if (!item || (item.pointerId !== undefined && item.pointerId !== event.pointerId)) return;
      if (!item.moved && Math.hypot(event.clientX - item.x, event.clientY - item.y) < 7) return;
      item.moved = true;
      const overId = targetAt(event);
      const { workspace, lockedIds = [] } = current.current;
      const target = workspace.state.tabs.find((tab) => tab.id === overId);
      const allowed = Boolean(overId) && (item.kind === 'tab' || !lockedIds.includes(target?.documentId));
      setPreview({ ...item, x: event.clientX, y: event.clientY, overId, allowed });
      if (event.cancelable) event.preventDefault();
      // Scroll a long tab strip as the pointer approaches its edges.
      const list = document.elementFromPoint(event.clientX, event.clientY)?.closest('.workspace-tablist');
      if (list) { const bounds = list.getBoundingClientRect(); if (event.clientX > bounds.right - 30) list.scrollLeft += 18; else if (event.clientX < bounds.left + 30) list.scrollLeft -= 18; }
    };
    const finish = (event) => {
      const item = gesture.current;
      if (!item && suppressClick.current) { setTimeout(() => { suppressClick.current = false; }, 0); return; }
      if (!item || (item.pointerId !== undefined && item.pointerId !== event.pointerId)) return;
      if (!item.moved) { cancel(); return; }
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const { workspace, lockedIds = [], setNotice } = current.current;
      const overId = targetAt(event);
      const target = workspace.state.tabs.find((tab) => tab.id === overId);
      if (item.kind === 'tab' && target) workspace.reorder(item.sourceId, overId);
      else if (item.kind === 'tool' && overId) {
        if (lockedIds.includes(target?.documentId)) setNotice?.('Bu sekmede donanım işlemi sürüyor; içerik değiştirilemez.');
        else if (target) { workspace.replace(item.tool, target.id, lockedIds); setNotice?.('Sekme değiştirildi. Önceki taslak bildirim merkezinden geri açılabilir.'); }
        else workspace.open(item.tool, { fresh: true });
      }
      cancel();
    };
    const escape = (event) => { if (event.key === 'Escape' && gesture.current) { if (gesture.current.moved) suppressClick.current = true; cancel(); } };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel); };
  }, []);
  return { preview, suppressClick, start(event, payload) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { ...payload, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
  } };
}
