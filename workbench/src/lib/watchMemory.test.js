import test from 'node:test';
import assert from 'node:assert/strict';
import { watchDraft, saveWatchDraft, recordFirmware, firmwareHistory } from './watchMemory.js';
const uid = 'ABCDEF1234567890ABCDEF12';
const storage = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
test('watch drafts are isolated by document and board but normalize factory UID case', () => {
  const draft = { elf: { variables: [] }, file: { name: 'test.elf' }, selected: ['counter'] };
  saveWatchDraft('one', uid, draft);
  assert.equal(watchDraft('one', uid.toLowerCase()), draft);
  assert.equal(watchDraft('two', uid), undefined);
  assert.equal(watchDraft('one', '1'.repeat(24)), undefined);
});
test('firmware ledger retains ordered upload attempts without confusing selection with success', () => {
  const store = storage();
  recordFirmware(uid, null, { status: 'programming', name: 'new.bin', size: 64 }, store);
  recordFirmware(uid, null, { status: 'error', name: 'new.bin', error: 'Readback failed' }, store);
  const final = recordFirmware(uid, { name: 'new.elf', size: 200 }, {}, store);
  const rows = firmwareHistory(uid.toLowerCase(), store);
  assert.deepEqual(rows.map(r => r.status), ['programming', 'error', 'loaded']);
  assert.equal(rows[0].hasElf, false); assert.equal(rows[2].hasElf, true);
  assert.equal(rows.at(-1).id, final.id);
  for (let i = 0; i < 60; i++) recordFirmware(uid, null, { status: 'loaded' }, store);
  assert.equal(firmwareHistory(uid, store).length, 50);
});
test('corrupt or unavailable local storage cannot fail a hardware operation', () => {
  assert.deepEqual(firmwareHistory(uid, { getItem: () => '{broken' }), []);
  assert.doesNotThrow(() => recordFirmware(uid, null, {}, { getItem: () => { throw new Error('blocked'); } }));
  assert.equal(recordFirmware('invalid', null, {}, storage()), null);
});
