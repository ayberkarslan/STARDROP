const drafts = new Map();
const LEDGER = 'stardrop.firmware-history.v1';
const key = uid => /^[a-f0-9]{24}$/i.test(uid || '') ? uid.toUpperCase() : null;
export function watchDraft(documentId, uid) { return drafts.get(`${documentId}:${key(uid)}`); }
export function saveWatchDraft(documentId, uid, draft) {
  if (key(uid) && draft.elf && draft.file) drafts.set(`${documentId}:${key(uid)}`, draft);
}
export function firmwareHistory(uid, storage = globalThis.localStorage) {
  try { const rows = JSON.parse(storage.getItem(LEDGER) || '{}')[key(uid)]; return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}
export function recordFirmware(uid, file, details = {}, storage = globalThis.localStorage) {
  if (!key(uid)) return null;
  const row = { id: crypto.randomUUID(), at: Date.now(), status: details.status || 'loaded',
    name: details.name || file?.name || null, size: details.size || file?.size || null,
    hasElf: Boolean(file), imageSha256: details.imageSha256 || null, error: details.error || null };
  try {
    const data = JSON.parse(storage.getItem(LEDGER) || '{}');
    data[key(uid)] = [...firmwareHistory(uid, storage), row].slice(-50);
    storage.setItem(LEDGER, JSON.stringify(data));
  } catch { /* Storage failures must not turn a successful flash into a failure. */ }
  return row;
}
let database;
function openStore() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('ELF saklama kullanılamıyor.'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('stardrop-watch', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('elf');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('ELF deposu başka pencerede kilitli.'));
  });
  return database;
}
async function transaction(mode, operation) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('elf', mode), request = operation(tx.objectStore('elf'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function rememberWatchElf(uid, file) {
  if (!key(uid) || !file || file.size > 16 * 1024 * 1024) return;
  const revision = firmwareHistory(uid).at(-1)?.id || null;
  await transaction('readwrite', store => store.put({ file, revision }, key(uid)));
}
export async function recalledWatchElf(uid) {
  if (!key(uid)) return null;
  const stored = await transaction('readonly', store => store.get(key(uid)));
  // Another local upload (including a BIN or failed partial write) invalidates
  // the remembered association. Hardware flash is still verified on each start.
  if (!stored || stored.revision !== (firmwareHistory(uid).at(-1)?.id || null)) return null;
  return stored.file;
}
