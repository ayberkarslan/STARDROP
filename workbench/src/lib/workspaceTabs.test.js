import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialWorkspace, workspaceReducer as reduce } from './workspaceTabs.js';

test('tools focus existing tabs instead of duplicating a shared project', () => {
  const state = reduce(initialWorkspace, { type: 'open', tool: 'workbench', id: 'test' });
  const next = reduce(state, { type: 'open', tool: 'flash', id: 'duplicate' });
  assert.equal(next.tabs.length, 2);
  assert.equal(next.activeId, 'initial-flash');
});
test('new blank tab becomes the chosen tool', () => {
  const state = reduce(initialWorkspace, { type: 'new', id: 'blank' });
  const next = reduce(state, { type: 'open', tool: 'library', id: 'unused' });
  assert.deepEqual(next.tabs[1], { id: 'blank', type: 'library' });
  assert.equal(next.activeId, 'blank');
});
test('closing picks a neighbour and retains visited screen state', () => {
  let state = reduce(initialWorkspace, { type: 'open', tool: 'workbench', id: 'test' });
  state = reduce(state, { type: 'close', id: 'test' });
  assert.equal(state.activeId, 'initial-flash');
  assert.deepEqual(state.visited, ['flash', 'workbench']);
  state = reduce(state, { type: 'close', id: 'initial-flash' });
  assert.equal(state.activeId, null);
  assert.deepEqual(state.tabs, []);
});
test('reordering preserves selected tab and ignores unknown targets', () => {
  const state = reduce(initialWorkspace, { type: 'new', id: 'blank' });
  const next = reduce(state, { type: 'reorder', id: 'blank', overId: 'initial-flash' });
  assert.deepEqual(next.tabs.map((tab) => tab.id), ['blank', 'initial-flash']);
  assert.equal(next.activeId, 'blank');
  assert.equal(reduce(next, { type: 'reorder', id: 'invalid', overId: 'blank' }), next);
});
