export const workspaceLabels = {
  flash: 'Hızlı Yükleme', workbench: 'Yeni Test', library: 'Test Kütüphanesi',
  admin: 'Test Yönetimi', settings: 'Ayarlar', empty: 'Yeni Sekme',
};

export const initialWorkspace = {
  tabs: [{ id: 'initial-flash', type: 'flash' }], activeId: 'initial-flash', visited: ['flash'],
};

export function workspaceReducer(state, action) {
  if (action.type === 'open') {
    if (!workspaceLabels[action.tool] || action.tool === 'empty') return state;
    const existing = state.tabs.find((tab) => tab.type === action.tool);
    if (existing) return { ...state, activeId: existing.id };
    const active = state.tabs.find((tab) => tab.id === state.activeId);
    const tab = { id: active?.type === 'empty' ? active.id : action.id, type: action.tool };
    return { tabs: active?.type === 'empty' ? state.tabs.map((item) => item.id === active.id ? tab : item) : [...state.tabs, tab],
      activeId: tab.id, visited: [...new Set([...state.visited, action.tool])] };
  }
  if (action.type === 'new') return { ...state, tabs: [...state.tabs, { id: action.id, type: 'empty' }], activeId: action.id };
  if (action.type === 'activate') return state.tabs.some((tab) => tab.id === action.id) ? { ...state, activeId: action.id } : state;
  if (action.type === 'close') {
    const index = state.tabs.findIndex((tab) => tab.id === action.id);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== action.id);
    return { ...state, tabs, activeId: state.activeId === action.id ? (tabs[Math.min(index, tabs.length - 1)]?.id || null) : state.activeId };
  }
  if (action.type === 'reorder') {
    const from = state.tabs.findIndex((tab) => tab.id === action.id);
    const to = state.tabs.findIndex((tab) => tab.id === action.overId);
    if (from < 0 || to < 0 || from === to) return state;
    const tabs = [...state.tabs];
    tabs.splice(to, 0, tabs.splice(from, 1)[0]);
    return { ...state, tabs };
  }
  return state;
}
