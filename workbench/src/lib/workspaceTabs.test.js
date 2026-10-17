import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialWorkspace, railToolForMode, workspaceReducer as reduce } from './workspaceTabs.js';
const doc = (state, tabId = state.activeId) => state.documents.find(item => item.id === state.tabs.find(tab => tab.id === tabId)?.documentId);
test('test entry stays selected in the hub, editor and library', () => {
  assert.equal(railToolForMode('tests'), 'tests');
  assert.equal(railToolForMode('workbench'), 'tests');
  assert.equal(railToolForMode('library'), 'tests');
  assert.equal(railToolForMode('flash'), 'flash');
  const hub = reduce(initialWorkspace, { type: 'open', tool: 'tests', id: 'test-home' });
  assert.equal(doc(hub).type, 'tests');
  const editor = reduce(hub, { type: 'open', tool: 'workbench', id: 'new-test', fresh: true });
  assert.equal(doc(editor).type, 'workbench');
  assert.equal(editor.tabs.length, 3);
});
test('menu focuses a view; explicit requests create separate documents', () => {
  let state = reduce(initialWorkspace, { type: 'open', tool: 'workbench', id: 'a' });
  state = reduce(state, { type: 'open', tool: 'workbench', id: 'b', fresh: true });
  assert.equal(state.tabs.length, 3);
  assert.notEqual(doc(state, 'a').id, doc(state, 'b').id);
  state = reduce(state, { type: 'open', tool: 'workbench', id: 'unused' });
  assert.equal(state.tabs.length, 3);
  assert.equal(state.activeId, 'a');
});
test('blank tab becomes a tool without changing its tab identity', () => {
  const state = reduce(initialWorkspace, { type: 'new', id: 'blank' });
  const next = reduce(state, { type: 'open', tool: 'library', id: 'library-doc' });
  assert.deepEqual(next.tabs[1], { id: 'blank', documentId: 'library-doc' });
  assert.equal(doc(next).type, 'library');
});
test('replacement retains origin document; recovery creates a separate tab', () => {
  let state = reduce(initialWorkspace, { type: 'open', tool: 'workbench', id: 'draft' });
  state = reduce(state, { type: 'replace', tool: 'settings', targetId: 'draft', id: 'settings-doc' });
  assert.equal(doc(state).type, 'settings');
  assert.equal(state.documents.find(item => item.id === 'draft').type, 'workbench');
  state = reduce(state, { type: 'undo', id: 'restored' });
  assert.equal(doc(state).id, 'draft');
  assert.equal(doc(state, 'draft').id, 'settings-doc');
});
test('close picks a neighbour and keeps the document available for recovery', () => {
  let state = reduce(initialWorkspace, { type: 'open', tool: 'workbench', id: 'test' });
  state = reduce(state, { type: 'close', id: 'test' });
  assert.equal(state.activeId, 'initial-flash');
  assert.equal(state.documents.length, 2);
  state = reduce(state, { type: 'close', id: 'initial-flash' });
  assert.equal(state.activeId, null);
  assert.deepEqual(state.tabs, []);
  state = reduce(state, { type: 'undo', id: 'restored' });
  assert.equal(doc(state).id, 'initial-flash');
});
test('running documents cannot be closed or replaced', () => {
  const state = reduce(initialWorkspace, { type: 'new', id: 'other' });
  const lockedIds = ['initial-flash'];
  assert.equal(reduce(state, { type: 'close', id: 'initial-flash', lockedIds }), state);
  assert.equal(reduce(state, { type: 'replace', targetId: 'initial-flash', tool: 'workbench', id: 'bad', lockedIds }), state);
  const next = reduce(state, { type: 'replace', targetId: 'other', tool: 'workbench', id: 'good', lockedIds });
  assert.equal(doc(next).id, 'good');
});
test('reorder preserves selection and ignores unknown targets', () => {
  const state = reduce(initialWorkspace, { type: 'new', id: 'blank' });
  const next = reduce(state, { type: 'reorder', id: 'blank', overId: 'initial-flash' });
  assert.deepEqual(next.tabs.map(tab => tab.id), ['blank', 'initial-flash']);
  assert.equal(next.activeId, 'blank');
  assert.equal(reduce(next, { type: 'reorder', id: 'invalid', overId: 'blank' }), next);
});
test('reset clears recovery and uses distinct guest/signed identities', () => {
  const main = reduce(initialWorkspace, { type: 'reset', prefix: 'main' });
  const guest = reduce(initialWorkspace, { type: 'reset', prefix: 'guest' });
  assert.notEqual(doc(main).id, doc(guest).id);
  assert.deepEqual(guest.recovery, []);
});
