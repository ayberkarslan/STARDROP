import assert from 'node:assert/strict';
import test from 'node:test';
import { testFailureMessage } from './testFailure.js';

test('test failures retain Rust/Tauri string errors', () => {
  assert.equal(testFailureMessage('Seçilen test kaynakta yok'), 'Seçilen test kaynakta yok');
  assert.equal(testFailureMessage(new Error('Derleme durdu')), 'Derleme durdu');
  assert.equal(testFailureMessage({ error: 'Kaynak sürümü eski' }), 'Kaynak sürümü eski');
  assert.doesNotMatch(testFailureMessage(null), /undefined/);
});
