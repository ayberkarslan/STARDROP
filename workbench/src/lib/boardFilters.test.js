import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardChoices, filterBoards } from './boardFilters.js';

const first = '001300155231501920323239', second = '001300155231501920323240';

test('board list merges registry and journal by UID and puts recent board first', () => {
  const records = { [first]: { uid: first, label: 'OBC', model: 'STM32F446RE' },
    [second]: { uid: second, label: 'Yedek', model: 'STM32F401' } };
  const journals = { [first]: { lastSeenAt: 10 }, [second]: { lastSeenAt: 20 }, invalid: { lastSeenAt: 30 } };
  assert.deepEqual(boardChoices(records, journals).map(board => board.uid), [second, first]);
});

test('search, MCU and health filters combine without hiding unrelated stored boards', () => {
  const boards = [{ uid: first, label: 'OBC', model: 'STM32F446RE' },
    { uid: second, label: 'Yedek', model: 'STM32F401' }];
  const journals = { [first]: { status: 'check' } };
  assert.deepEqual(filterBoards(boards, journals, { query: 'obc', model: 'STM32F446RE', status: 'check' }).map(board => board.uid), [first]);
  assert.deepEqual(filterBoards(boards, journals, { status: 'unknown' }).map(board => board.uid), [second]);
  assert.deepEqual(filterBoards(boards, journals, { model: 'STM32F446RE', status: 'unknown' }), []);
});
