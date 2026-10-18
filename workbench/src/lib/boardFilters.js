import { targetUid } from './targetRegistry.js';

export function boardChoices(records, journals) {
  const uids = new Set([...Object.keys(records), ...Object.keys(journals)]);
  return [...uids].filter(targetUid).map(uid => ({ uid, ...(records[uid] || {}), model: records[uid]?.model || journals[uid]?.hardware?.model || '' }))
    .sort((a, b) => (journals[b.uid]?.lastSeenAt || b.updatedAt || 0) -
      (journals[a.uid]?.lastSeenAt || a.updatedAt || 0));
}

export function filterBoards(boards, journals, { query = '', model = 'all', status = 'all' } = {}) {
  const search = query.trim().toLocaleLowerCase('tr-TR');
  return boards.filter(board => {
    const text = `${board.label || ''} ${board.uid} ${board.model || ''}`.toLocaleLowerCase('tr-TR');
    return (!search || text.includes(search)) && (model === 'all' || board.model === model) &&
      (status === 'all' || (journals[board.uid]?.status || 'unknown') === status);
  });
}
