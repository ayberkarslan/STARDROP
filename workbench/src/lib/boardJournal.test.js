import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardEvent, boardNameChange, boardTimeline, timelineDays, timelineTone } from './boardJournal.js';

const uid = '001300155231501920323239';

test('journal rejects invalid identity and invalid entries', () => {
  assert.throws(() => boardEvent('bad', 'note', 'Test'));
  assert.throws(() => boardEvent(uid, 'other', 'Test'));
  assert.throws(() => boardEvent(uid, 'note', ' '));
  assert.throws(() => boardEvent(uid, 'note', 'Test', 'x'.repeat(2001)));
  const entry = boardEvent(uid, 'note', 'Test', 'Çalıştı', 100);
  assert.equal(entry.kind, 'note'); assert.equal(entry.at, 100);
});

test('name history distinguishes first naming, real renames and unchanged saves', () => {
  assert.deepEqual(boardNameChange('', 'OBC V2'), { title: 'Kart adlandırıldı', detail: 'OBC V2' });
  assert.deepEqual(boardNameChange('OBC V2', 'OBC V3'), { title: 'Kart adı değiştirildi', detail: 'OBC V2 → OBC V3' });
  assert.equal(boardNameChange('OBC V3', ' OBC V3 '), null);
  assert.equal(boardNameChange('OBC V3', ''), null);
});

test('timeline merges historical flash and analysis without duplicating journal flash', () => {
  const journal = { events: [{ id: 'manual', kind: 'note', title: 'Not', at: 300 },
    { id: 'flash', kind: 'flash', title: 'Yazılım yüklendi', detail: 'test.bin', at: 200 }] };
  const rows = boardTimeline(journal, [{ id: 'old', at: 200, status: 'loaded', name: 'test.bin' },
    { id: 'older', at: 100, status: 'loaded', name: 'old.bin' }], { analyzedAt: 250, programmedBytes: 10, freeBytes: 90 });
  assert.deepEqual(rows.map(row => row.at), [300, 250, 200, 100]);
  assert.equal(rows.filter(row => row.kind === 'flash').length, 2);
});

test('daily groups and result tones keep chronological records readable', () => {
  const entries = [{ id: 'a', at: new Date(2026, 9, 17, 15).getTime() },
    { id: 'b', at: new Date(2026, 9, 17, 11).getTime() },
    { id: 'c', at: new Date(2026, 9, 16, 11).getTime() }];
  assert.deepEqual(timelineDays(entries).map(group => group.events.map(row => row.id)), [['a', 'b'], ['c']]);
  assert.equal(timelineTone({ kind: 'test', title: 'LED: başarılı' }), 'pass');
  assert.equal(timelineTone({ kind: 'test', title: 'LED: başarısız' }), 'fail');
  assert.equal(timelineTone({ kind: 'issue', title: 'Kontrol gerekli' }), 'caution');
});
