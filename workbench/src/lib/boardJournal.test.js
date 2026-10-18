import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardEvent, boardHardwareSnapshot, boardNameChange, boardTimeline, groupBoardTimeline } from './boardJournal.js';

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

test('nearby consecutive uploads collapse without losing their details', () => {
  const flash = (id, at, detail) => ({ id, kind: 'flash', at, title: 'Yazılım yüklendi', detail });
  const events = [flash('new', 2_000_000, 'new.bin'), flash('middle', 1_990_000, 'middle.bin'),
    flash('old', 1_980_000, 'old.bin'), { id: 'note', kind: 'note', at: 1_970_000, title: 'Kontrol edildi' },
    flash('after-note', 1_960_000, 'other.bin')];
  const grouped = groupBoardTimeline(events);
  assert.deepEqual(grouped.map(row => row.kind), ['flash-group', 'note', 'flash']);
  assert.deepEqual(grouped[0].events.map(row => row.detail), ['new.bin', 'middle.bin', 'old.bin']);
  assert.equal(grouped[0].at, events[0].at);
  assert.equal(grouped[0].endAt, events[2].at);
  assert.equal(events[0].kind, 'flash');
});

test('uploads from different sessions stay separate', () => {
  const flash = (id, at) => ({ id, kind: 'flash', at, title: 'Yazılım yüklendi' });
  const events = [flash('today', 4_000_000), flash('yesterday', 1_000_000), flash('earlier', 990_000)];
  const grouped = groupBoardTimeline(events);
  assert.deepEqual(grouped.map(row => row.kind), ['flash', 'flash-group']);
  assert.deepEqual(grouped[1].events.map(row => row.id), ['yesterday', 'earlier']);
});

test('hardware snapshot is tied to a connected UID and excludes transient connection state', () => {
  const target = { connected: true, uid, model: 'STM32F446', deviceId: '0x421', revisionId: '0x1000', dpIdcode: '0x2ba01477', flashSizeKb: 512 };
  assert.deepEqual(boardHardwareSnapshot(target, 123), { model: 'STM32F446', deviceId: '0x421', revisionId: '0x1000',
    dpIdcode: '0x2ba01477', flashSizeKb: 512, observedAt: 123 });
  assert.equal(boardHardwareSnapshot({ ...target, connected: false }), null);
  assert.equal(boardHardwareSnapshot({ ...target, uid: 'invalid' }), null);
});
