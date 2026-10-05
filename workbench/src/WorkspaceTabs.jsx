import { useEffect, useReducer, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { initialWorkspace, workspaceLabels, workspaceReducer } from './lib/workspaceTabs.js';

export function useWorkspaceTabs() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  useEffect(() => { document.dispatchEvent(new Event('stardrop-tab-change')); }, [state.activeId]);
  return { state, mode: state.tabs.find((tab) => tab.id === state.activeId)?.type || 'empty',
    open: (tool) => dispatch({ type: 'open', tool, id: crypto.randomUUID() }),
    create: () => dispatch({ type: 'new', id: crypto.randomUUID() }),
    activate: (id) => dispatch({ type: 'activate', id }),
    close: (id) => dispatch({ type: 'close', id }),
    reorder: (id, overId) => dispatch({ type: 'reorder', id, overId }) };
}

export default function WorkspaceTabs({ workspace, lockedTypes = [] }) {
  const { state, activate, close, create, reorder } = workspace;
  const drag = useRef(null);
  const strip = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const move = (event) => {
      if (!drag.current) return;
      if (Math.abs(event.clientX - drag.current.x) > 8) drag.current.moved = true;
    };
    const finish = (event) => {
      const gesture = drag.current;
      drag.current = null;
      if (!gesture?.moved) return;
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-workspace-tab]');
      if (over && strip.current?.contains(over)) reorder(gesture.id, over.dataset.workspaceTab);
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    };
    const cancel = () => { drag.current = null; };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [reorder]);

  const keyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = state.tabs.findIndex((tab) => tab.id === event.currentTarget.dataset.tabId);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + state.tabs.length) % state.tabs.length;
    const id = state.tabs[next]?.id;
    if (!id) return;
    if (event.altKey) reorder(state.tabs[index].id, id);
    else { activate(id); strip.current?.querySelector(`[data-tab-id="${id}"]`)?.focus(); }
  };

  return <div className="workspace-tabbar" ref={strip}>
    <div className="workspace-tablist" role="tablist" aria-label="Çalışma sekmeleri">
      {state.tabs.map((tab) => <div className={`workspace-tab${tab.id === state.activeId ? ' active' : ''}`} key={tab.id} data-workspace-tab={tab.id}>
        <button type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.type}`} aria-selected={tab.id === state.activeId}
          tabIndex={tab.id === state.activeId ? 0 : -1} data-tab-id={tab.id} onKeyDown={keyboard}
          onPointerDown={(event) => { if (event.button === 0) drag.current = { id: tab.id, x: event.clientX, moved: false }; }}
          onClick={() => { if (!suppressClick.current) activate(tab.id); }}>{workspaceLabels[tab.type]}</button>
        <button type="button" className="workspace-tab-close" aria-label={`${workspaceLabels[tab.type]} sekmesini kapat`} disabled={lockedTypes.includes(tab.type)}
          title={lockedTypes.includes(tab.type) ? 'İşlem sürerken bu sekme kapatılamaz' : 'Sekmeyi kapat'} onClick={() => close(tab.id)}><X size={13} /></button>
      </div>)}
    </div>
    <button type="button" className="workspace-tab-new" onClick={create} aria-label="Yeni sekme aç" title="Yeni sekme"><Plus size={16} /></button>
  </div>;
}
