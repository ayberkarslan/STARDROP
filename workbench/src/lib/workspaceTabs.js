export const workspaceLabels = {
  flash: 'Hızlı Yükleme', tests: 'Yeni Test', workbench: 'Yeni Test', library: 'Test Kütüphanesi',
  devices: 'Cihazlar', boards: 'Kartlar', monitor: 'Canlı İzleme', admin: 'Test Yönetimi', settings: 'Ayarlar', empty: 'Yeni Sekme',
};

export const railToolForMode = mode => ['tests', 'workbench', 'library'].includes(mode) ? 'tests' : mode;

export const initialWorkspace = {
  tabs: [{ id: 'initial-flash', documentId: 'initial-flash' }],
  documents: [{ id: 'initial-flash', type: 'flash' }],
  activeId: 'initial-flash', recovery: [],
};

export function workspaceReducer(state, action) {
  const documentFor = (tab) => state.documents.find((doc) => doc.id === tab?.documentId);
  const archived = (tab) => documentFor(tab)?.type !== 'empty' ? [tab, ...state.recovery] : state.recovery;
  const addDocument = (type, data) => ({ id: action.documentId || action.id, type, initialData: data || null });
  if (action.type === 'open') {
    if (!workspaceLabels[action.tool] || action.tool === 'empty') return state;
    const active = state.tabs.find((tab) => tab.id === state.activeId);
    const blank = documentFor(active)?.type === 'empty';
    // Menu clicks reuse a view; explicit drops/new test entries always create an instance.
    const existing = !action.fresh && !blank && state.tabs.find((tab) => documentFor(tab)?.type === action.tool);
    if (existing) return { ...state, activeId: existing.id };
    const doc = addDocument(action.tool, action.data);
    const tab = { id: blank ? active.id : action.id, documentId: doc.id };
    return { ...state, documents: [...state.documents, doc],
      tabs: blank ? state.tabs.map((item) => item.id === active.id ? tab : item) : [...state.tabs, tab],
      activeId: tab.id };
  }
  if (action.type === 'replace') {
    if (!workspaceLabels[action.tool] || action.tool === 'empty') return state;
    const target = state.tabs.find((tab) => tab.id === action.targetId);
    if (!target || action.lockedIds?.includes(target.documentId)) return state;
    const doc = addDocument(action.tool, action.data);
    return { ...state, documents: [...state.documents, doc],
      tabs: state.tabs.map((tab) => tab.id === target.id ? { ...tab, documentId: doc.id } : tab),
      recovery: archived(target), activeId: target.id };
  }
  if (action.type === 'new') {
    const doc = addDocument('empty');
    return { ...state, documents: [...state.documents, doc],
      tabs: [...state.tabs, { id: action.id, documentId: doc.id }], activeId: action.id };
  }
  if (action.type === 'activate') return state.tabs.some((tab) => tab.id === action.id) ? { ...state, activeId: action.id } : state;
  if (action.type === 'close') {
    const index = state.tabs.findIndex((tab) => tab.id === action.id);
    if (index < 0 || action.lockedIds?.includes(state.tabs[index].documentId)) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== action.id);
    return { ...state, tabs, recovery: archived(state.tabs[index]),
      activeId: state.activeId === action.id ? (tabs[Math.min(index, tabs.length - 1)]?.id || null) : state.activeId };
  }
  if (action.type === 'undo') {
    const restored = state.recovery[0];
    if (!restored) return state;
    const existing = state.tabs.find((tab) => tab.documentId === restored.documentId);
    if (existing) return { ...state, activeId: existing.id, recovery: state.recovery.slice(1) };
    const tab = { ...restored, id: action.id };
    return { ...state, tabs: [...state.tabs, tab], activeId: tab.id, recovery: state.recovery.slice(1) };
  }
  if (action.type === 'reorder') {
    const from = state.tabs.findIndex((tab) => tab.id === action.id);
    const to = state.tabs.findIndex((tab) => tab.id === action.overId);
    if (from < 0 || to < 0 || from === to) return state;
    const tabs = [...state.tabs];
    tabs.splice(to, 0, tabs.splice(from, 1)[0]);
    return { ...state, tabs };
  }
  if (action.type === 'reset') {
    const id = (action.prefix || 'main') + '-initial-flash';
    return { tabs: [{ id, documentId: id }], documents: [{ id, type: 'flash' }], activeId: id, recovery: [] };
  }
  return state;
}
