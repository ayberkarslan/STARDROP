import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardEvent, boardTimeline } from './boardJournal.js';

const uid = '001300155231501920323239';

test('journal rejects invalid identity and invalid entries', () => {
  assert.throws(() => boardEvent('bad', 'note', 'Test'));
  assert.throws(() => boardEvent(uid, 'other', 'Test'));
  assert.throws(() => boardEvent(uid, 'note', ' '));
  assert.throws(() => boardEvent(uid, 'note', 'Test', 'x'.repeat(2001)));
  const entry = boardEvent(uid, 'note', 'Test', 'Çalıştı', 100);
  assert.equal(entry.kind, 'note'); assert.equal(entry.at, 100);
});

test('timeline merges historical flash and analysis without duplicating journal flash', () => {
  const journal = { events: [{ id: 'manual', kind: 'note', title: 'Not', at: 300 },
    { id: 'flash', kind: 'flash', title: 'Yazılım yüklendi', detail: 'test.bin', at: 200 }] };
  const rows = boardTimeline(journal, [{ id: 'old', at: 200, status: 'loaded', name: 'test.bin' },
    { id: 'older', at: 100, status: 'loaded', name: 'old.bin' }], { analyzedAt: 250, programmedBytes: 10, freeBytes: 90 });
  assert.deepEqual(rows.map(row => row.at), [300, 250, 200, 100]);
  assert.equal(rows.filter(row => row.kind === 'flash').length, 2);
});
