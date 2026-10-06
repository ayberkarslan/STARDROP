import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTargetRegistry, namedTarget, targetUid, validateFlashAnalysis } from './targetRegistry.js';

const first = '001300155231501920323239', second = '001300155231501920323240';
function storage() {
  let records = {};
  return { load: async () => structuredClone(records), save: async ({ uid, label, model, overwrite }) => {
    if (overwrite || !records[uid]?.label) records[uid] = { ...records[uid], uid, label, model };
    return structuredClone(records);
  }, saveAnalysis: async ({ uid, model, analysis }) => {
    records[uid] = { uid, label: '', model, ...records[uid], flashAnalysis: { ...analysis, analyzedAt: 1700000000000 } };
    return structuredClone(records);
  } };
}

test('UID identity survives unplug, fresh ESP labels and registry reload', async () => {
  const disk = storage(); let records;
  const registry = createTargetRegistry({ ...disk, onChange: next => { records = next; } });
  await registry.save(first, 'Telemetri', 'STM32F446');
  await registry.save(second, 'Uçuş', 'STM32F446');
  assert.equal(namedTarget(null, records), null);
  assert.equal(namedTarget({ connected: false, uid: first }, records).label, undefined);
  assert.equal(namedTarget({ connected: true, uid: first, label: '' }, records).label, 'Telemetri');
  assert.equal(namedTarget({ connected: true, uid: second, label: 'Eski ESP adı' }, records).label, 'Uçuş');
  let reloaded;
  await createTargetRegistry({ ...disk, onChange: next => { reloaded = next; } }).ready;
  assert.equal(namedTarget({ connected: true, uid: first }, reloaded).label, 'Telemetri');
});

test('last analysis survives names, reload and other cards without masking firmware names', async () => {
  const disk = storage(); let records;
  const registry = createTargetRegistry({ ...disk, onChange: next => { records = next; } });
  const analysis = { totalBytes: 524288, programmedBytes: 4096, freeBytes: 520192, durationMs: 2500 };
  await registry.saveAnalysis(first, 'STM32F446', analysis);
  assert.equal(namedTarget({ connected: true, uid: first, label: 'ESP adı' }, records).label, 'ESP adı');
  await registry.save(first, 'Kart');
  await registry.saveAnalysis(second, 'STM32F446', { ...analysis, programmedBytes: 0, freeBytes: 524288 });
  let restored;
  await createTargetRegistry({ ...disk, onChange: next => { restored = next; } }).ready;
  assert.equal(restored[first].flashAnalysis.programmedBytes, 4096);
  assert.equal(restored[first].label, 'Kart');
  assert.equal(restored[second].flashAnalysis.programmedBytes, 0);
  await assert.rejects(registry.saveAnalysis(first, '', { ...analysis, freeBytes: 0 }));
  assert.equal(records[first].flashAnalysis.programmedBytes, 4096);
  assert.throws(() => validateFlashAnalysis({ ...analysis, totalBytes: NaN }));
});

test('late initialization and concurrent writes retain both names', async () => {
  const disk = storage(); let resolveLoad, records;
  const registry = createTargetRegistry({ ...disk, load: () => new Promise(resolve => { resolveLoad = resolve; }), onChange: next => { records = next; } });
  const a = registry.save(first, 'Kart A'), b = registry.save(second, 'Kart B');
  await Promise.resolve(); resolveLoad({}); await Promise.all([a, b]);
  assert.equal(records[first].label, 'Kart A'); assert.equal(records[second].label, 'Kart B');
  await registry.save(first, 'Eski ad', '', false);
  assert.equal(records[first].label, 'Kart A');
});

test('invalid UID, invalid names and failed persistence cannot report success', async () => {
  assert.equal(targetUid('00130015523150192032ABCD'), '00130015523150192032abcd');
  assert.equal(targetUid('0'.repeat(24)), null); assert.equal(targetUid('../../other'), null);
  let changed = {};
  const registry = createTargetRegistry({ load: async () => ({}), save: async () => { throw new Error('disk full'); }, onChange: next => { changed = next; } });
  await assert.rejects(registry.save('wrong', 'Kart'));
  await assert.rejects(registry.save(first, 'a'.repeat(33)));
  await assert.rejects(registry.save(first, 'Kart\nA'));
  await assert.rejects(registry.save(first, 'Kart'), /disk full/);
  assert.deepEqual(changed, {});
});
