import { useEffect, useReducer, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { initialWorkspace, workspaceLabels, workspaceReducer } from './lib/workspaceTabs.js';

export function useWorkspaceTabs(prefix = 'main') {
  const initial = { ...initialWorkspace, tabs: [{ id: prefix + '-initial-flash', documentId: prefix + '-initial-flash' }], documents: [{ id: prefix + '-initial-flash', type: 'flash' }] , activeId: prefix + '-initial-flash' };
  const [state, dispatch] = useReducer(workspaceReducer, initial);
  const active = state.tabs.find((tab) => tab.id === state.activeId);
  const document = state.documents.find((doc) => doc.id === active?.documentId);
  useEffect(() => { window.document.dispatchEvent(new Event('stardrop-tab-change')); }, [state.activeId, active?.documentId]);
  const open = useCallback((tool, options = {}) => dispatch({ type: 'open', tool, id: crypto.randomUUID(), ...options }), []);
  const create = useCallback(() => dispatch({ type: 'new', id: crypto.randomUUID() }), []);
  const activate = useCallback((id) => dispatch({ type: 'activate', id }), []);
  const close = useCallback((id, lockedIds = []) => dispatch({ type: 'close', id, lockedIds }), []);
  const reorder = useCallback((id, overId) => dispatch({ type: 'reorder', id, overId }), []);
  const replace = useCallback((tool, targetId, lockedIds = []) => dispatch({ type: 'replace', tool, targetId, lockedIds, id: crypto.randomUUID() }), []);
  const undo = useCallback(() => dispatch({ type: 'undo', id: crypto.randomUUID() }), []);
  const reset = useCallback(() => dispatch({ type: 'reset', prefix }), [prefix]);
  return { state, mode: document?.type || 'empty', activeDocumentId: document?.id,
    open, create, activate, close, reorder, replace, undo, reset };
}

export default function WorkspaceTabs({ workspace, lockedIds = [], drag, titles = {} }) {
  const { state, activate, close, create, reorder } = workspace;
  const documentFor = (tab) => state.documents.find((doc) => doc.id === tab.documentId);
  const labelFor = (doc) => titles[doc.id] || workspaceLabels[doc.type];
  const keyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = state.tabs.findIndex((tab) => tab.id === event.currentTarget.dataset.tabId);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + state.tabs.length) % state.tabs.length;
    const id = state.tabs[next]?.id;
    if (!id) return;
    if (event.altKey) reorder(state.tabs[index].id, id);
    else { activate(id); event.currentTarget.closest('.workspace-tablist')?.querySelector('[data-tab-id="' + id + '"]')?.focus(); }
  };
  return <div className="workspace-tabbar">
    <div className="workspace-tablist" role="tablist" aria-label="Çalışma sekmeleri">
      {state.tabs.map((tab) => {
        const doc = documentFor(tab);
        const label = labelFor(doc);
        const locked = lockedIds.includes(doc.id);
        return <div className={'workspace-tab' + (tab.id === state.activeId ? ' active' : '') +
          (drag?.preview?.overId === tab.id ? ' drop-target' : '') + (drag?.preview?.sourceId === tab.id ? ' dragging' : '')}
          key={tab.id} data-drop-tab={tab.id}>
          <button type="button" role="tab" id={'tab-' + tab.id} aria-controls={'panel-' + doc.id} aria-selected={tab.id === state.activeId}
            tabIndex={tab.id === state.activeId ? 0 : -1} data-tab-id={tab.id} onKeyDown={keyboard}
            onPointerDown={(event) => drag?.start(event, { kind: 'tab', sourceId: tab.id, label })}
            onClick={() => { if (!drag?.suppressClick.current) activate(tab.id); }}>{label}{locked && <span className="tab-busy-dot" aria-label="İşlem sürüyor"/>}</button>
          <button type="button" className="workspace-tab-close" aria-label={label + ' sekmesini kapat'} disabled={locked}
            title={locked ? 'İşlem sürerken bu sekme kapatılamaz' : 'Sekmeyi kapat'} onClick={() => close(tab.id, lockedIds)}><X size={13} /></button>
        </div>;
      })}
    </div>
    <button type="button" className="workspace-tab-new" onClick={create} aria-label="Yeni sekme aç" title="Yeni sekme"><Plus size={16} /></button>
  </div>;
}
