import { targetUid } from './targetRegistry.js';

const DATABASE = 'stardrop-board-journal';
const STORE = 'boards';
const CHANGE = 'stardrop-board-journal-change';
let opening;

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Yerel kart veritabanı kullanılamıyor.'));
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'uid' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Kart veritabanı açılamadı.'));
    request.onblocked = () => reject(new Error('Kart veritabanı başka pencerede açık.'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}

function transact(mode, operation) {
  return database().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    operation(tx.objectStore(STORE), value => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Kart kaydı yazılamadı.'));
    tx.onabort = () => reject(tx.error || new Error('Kart kaydı iptal edildi.'));
  }));
}

export function boardEvent(uid, kind, title, detail = '', at = Date.now()) {
  const normalized = targetUid(uid);
  if (!normalized) throw new Error('Geçerli kart UID’si gerekli.');
  if (!['connected', 'flash', 'test', 'note', 'issue', 'analysis', 'name'].includes(kind)) throw new Error('Olay türü geçersiz.');
  const cleanTitle = String(title || '').trim();
  const cleanDetail = String(detail || '').trim();
  if (!cleanTitle || cleanTitle.length > 120 || cleanDetail.length > 2000 || !Number.isFinite(at)) throw new Error('Olay kaydı geçersiz.');
  return { id: crypto.randomUUID(), kind, title: cleanTitle, detail: cleanDetail, at };
}

export function boardNameChange(previous, next) {
  const oldName = String(previous || '').trim();
  const newName = String(next || '').trim();
  if (!newName || oldName === newName) return null;
  return { title: oldName ? 'Kart adı değiştirildi' : 'Kart adlandırıldı',
    detail: oldName ? `${oldName} → ${newName}` : newName };
}

export async function listBoardJournals() {
  return transact('readonly', (store, done) => {
    const request = store.getAll(); request.onsuccess = () => done(request.result || []);
  });
}

export async function getBoardJournal(uid) {
  const normalized = targetUid(uid);
  if (!normalized) return null;
  return transact('readonly', (store, done) => {
    const request = store.get(normalized); request.onsuccess = () => done(request.result || null);
  });
}

export async function updateBoardJournal(uid, update) {
  const normalized = targetUid(uid);
  if (!normalized) throw new Error('Geçerli kart UID’si gerekli.');
  const result = await transact('readwrite', (store, done) => {
    const request = store.get(normalized);
    request.onsuccess = () => {
      const current = request.result || { uid: normalized, status: 'unknown', events: [], lastSeenAt: null, photo: null };
      const next = update(current);
      if (!next || next.uid !== normalized || !Array.isArray(next.events)) { store.transaction.abort(); return; }
      store.put(next); done(next);
    };
  });
  globalThis.dispatchEvent?.(new Event(CHANGE));
  return result;
}

export function listenBoardJournal(callback) {
  globalThis.addEventListener(CHANGE, callback);
  return () => globalThis.removeEventListener(CHANGE, callback);
}

export function recordBoardEvent(uid, kind, title, detail = '') {
  let event;
  try { event = boardEvent(uid, kind, title, detail); } catch { return Promise.resolve(null); }
  return updateBoardJournal(uid, current => {
    const previous = current.events.at(-1);
    const repeatedConnection = kind === 'connected' && previous?.kind === 'connected' && event.at - previous.at < 30000;
    return { ...current, events: repeatedConnection ? current.events : [...current.events, event],
      lastSeenAt: kind === 'connected' ? event.at : current.lastSeenAt };
  });
}

export function boardTimeline(journal, firmware = [], analysis = null) {
  const events = [...(journal?.events || [])];
  if (analysis?.analyzedAt && !events.some(event => event.kind === 'analysis' && Math.abs(event.at - analysis.analyzedAt) < 2000)) {
    events.push({ id: 'analysis-' + analysis.analyzedAt, kind: 'analysis', at: analysis.analyzedAt,
      title: 'Flash analiz edildi', detail: `${analysis.programmedBytes} bayt programlanmış · ${analysis.freeBytes} bayt boş` });
  }
  for (const row of firmware) {
    if (!events.some(event => event.kind === 'flash' && Math.abs(event.at - row.at) < 2000 &&
      row.name && event.detail?.includes(row.name))) {
      events.push({ id: row.id, kind: 'flash', at: row.at, title: row.status === 'loaded' ? 'Yazılım yüklendi' : 'Yükleme denendi',
        detail: [row.name, row.error].filter(Boolean).join(' · ') });
    }
  }
  return events.sort((a, b) => b.at - a.at);
}

// The timeline stays intact in storage; only adjacent uploads from the same
// workshop session become one expandable row in the UI.
export function groupBoardTimeline(events, maxGapMs = 30 * 60 * 1000) {
  const grouped = [];
  for (const event of events) {
    const previous = grouped.at(-1);
    const previousFlash = previous?.kind === 'flash-group' ? previous.events.at(-1)
      : previous?.kind === 'flash' ? previous : null;
    const gap = previousFlash?.at - event.at;
    if (event.kind === 'flash' && previousFlash && gap >= 0 && gap <= maxGapMs) {
      if (previous.kind === 'flash-group') {
        previous.events.push(event);
        previous.endAt = event.at;
      } else {
        grouped[grouped.length - 1] = { id: `flash-group-${previous.id}`, kind: 'flash-group',
          at: previous.at, endAt: event.at, events: [previous, event] };
      }
    } else {
      grouped.push(event);
    }
  }
  return grouped;
}
