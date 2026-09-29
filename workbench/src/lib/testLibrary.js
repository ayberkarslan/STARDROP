import { validateBoardProfile } from './boardProfile.js';

export const LIBRARY_SCHEMA_VERSION = 1;

export function makeLibraryEntry({ name, note = '', profile, componentRef, test, history = [], author, sourceSha = null }) {
  const title = String(name || '').trim();
  if (title.length < 3 || title.length > 100) throw new Error('Kayıt adı 3–100 karakter olmalı.');
  if (String(note).length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
  if (!profile || !validateBoardProfile(profile).valid) throw new Error('Kart profilindeki pinleri önce düzelt.');
  const component = profile.components.find((item) => item.ref === componentRef);
  if (!component) throw new Error('Paylaşılacak bileşeni seç.');
  const connections = profile.connections.filter((item) => item.componentRef === componentRef);
  if (!connections.length || connections.some((item) => !item.approved)) throw new Error('Bileşen pinlerini önce onayla.');
  const lastRun = test?.status === 'ready' ? [...history].reverse().find((run) => run.componentRef === componentRef && run.testId === test.id && ['PASS', 'FAIL'].includes(run.status)) : null;
  const publishedProfile = JSON.parse(JSON.stringify(profile));
  publishedProfile.targetUid = null;
  publishedProfile.audit = [];
  publishedProfile.reviews = [];
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: title,
    note: String(note).trim(),
    publishedAt: new Date().toISOString(),
    author: String(author || '').trim(),
    board: { name: profile.name, mcu: profile.mcu.part },
    component: { ref: component.ref, part: component.part, protocol: component.protocol },
    pins: connections.map(({ role, mcuPin, peripheral }) => ({ role, mcuPin, peripheral })),
    test: test?.status === 'ready'
      ? { id: test.id, name: test.name, sourcePath: test.sourcePath, sourceSha, status: 'ready' }
      : { id: null, name: 'Kod bekleniyor', sourcePath: null, sourceSha: null, status: 'planned' },
    result: lastRun ? { status: lastRun.status, at: lastRun.confirmedAt || lastRun.at, method: lastRun.confirmation || test.result,
      firmwareSha256: lastRun.firmwareSha256 || null, sourceSha: lastRun.sourceSha || null } : { status: 'NOT_RUN' },
    profile: publishedProfile,
  };
}

export function validateLibraryEntry(entry) {
  return entry?.schemaVersion === LIBRARY_SCHEMA_VERSION
    && /^[0-9a-f-]{36}$/i.test(entry.id || '')
    && typeof entry.name === 'string' && entry.name.length <= 100
    && typeof entry.publishedAt === 'string'
    && typeof entry.board?.name === 'string' && typeof entry.board?.mcu === 'string'
    && typeof entry.component?.ref === 'string' && typeof entry.component?.part === 'string'
    && typeof entry.test?.name === 'string'
    && (entry.test?.id === null || typeof entry.test?.id === 'string')
    && entry.profile?.schemaVersion === 1
    && Array.isArray(entry.pins)
    && entry.pins.every((pin) => typeof pin.role === 'string' && typeof pin.mcuPin === 'string')
    && ['NOT_RUN', 'PASS', 'FAIL'].includes(entry.result?.status);
}

export function searchLibrary(entries, query) {
  const terms = String(query || '').toLocaleLowerCase('tr-TR').trim().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const haystack = [entry.name, entry.note, entry.author, entry.board?.name, entry.board?.mcu,
      entry.component?.part, entry.component?.protocol, entry.test?.name, entry.result?.status,
      ...(entry.pins || []).flatMap((pin) => [pin.role, pin.mcuPin])].join(' ').toLocaleLowerCase('tr-TR');
    return terms.every((term) => haystack.includes(term));
  });
}
