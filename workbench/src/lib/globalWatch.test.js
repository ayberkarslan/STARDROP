import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHardwareGate } from './hardwareGate.js';
import { createGlobalWatch, decodeVariable, globalWatchCsv, resolveWatchName } from './globalWatch.js';

const uid = '001300155231501920323239', hash = 'a'.repeat(64);
const variable = { name: 'watch_random', address: 0x20000004, size: 4, kind: 'unsigned', typeName: 'uint32_t' };
const elf = { imageSha256: hash, imageSize: 4000, variables: [variable] };
const identity = { valid: true, uid, sha256: hash, session: 'test-session' };
const flush = () => new Promise(resolve => setImmediate(resolve));
test('verification errors distinguish old firmware from malformed fields', async () => {
  for (const [result, message] of [
    [{ valid: false, reason: 'WATCH_REQUEST_INVALID' }, /eski izleme/],
    [{ valid: false, reason: 'WATCH_REQUEST_INVALID', requestVersion: 2, detail: 'UID_FORMAT_INVALID' }, /UID biçimi/],
  ]) {
    const item = setup({ verify: async () => result });
    await item.session.start();
    assert.match(item.states.at(-1).message, message); assert.equal(item.hardware.current, null);
  }
});
test('uppercase and mixed-case factory UIDs are accepted without rewriting identity', async () => {
  for (const boardUid of ['002C00343232511232323432', '002c00343232511232323432', 'ABCDEF1234567890abcdef12']) {
    const response = { ...identity, uid: boardUid };
    const item = setup({ uid: boardUid, verify: async () => response,
      read: async () => ({ ...response, values: [{ address: variable.address, hex: 'e7030000', stable: true }] }) });
    await item.session.start(); await flush();
    assert.equal(item.frames[0].uid, boardUid); item.session.stop();
  }
});
test('invalid and erased UIDs fail before acquiring the hardware lease', async () => {
  for (const uid of ['0'.repeat(24), 'F'.repeat(24), 'Z'.repeat(24), '1234']) {
    const item = setup({ uid });
    await assert.rejects(item.session.start(), /STM32 UID/); assert.equal(item.hardware.current, null);
  }
});
test('typed names resolve exactly, reject missing and ambiguous symbols', () => {
  assert.equal(resolveWatchName(elf, '  watch_random '), variable);
  assert.throws(() => resolveWatchName(elf, 'watch_rand'), /bulunamadı/);
  assert.throws(() => resolveWatchName(elf, 'watch_random + 1'), /bulunamadı/);
  assert.throws(() => resolveWatchName({ variables: [variable, { ...variable, address: 0x20000008 }] }, variable.name), /birden fazla/);
});
test('live edits preserve the pending request snapshot and hardware lease', async () => {
  const second = { ...variable, name: 'counter', address: 0x20000008 };
  let finish; const requests = [];
  const item = setup({ elf: { ...elf, variables: [variable, second] }, read: (session, vars) => {
    requests.push(vars); return new Promise(resolve => { finish = () => resolve({ ...identity, values: vars.map(v => ({ address: v.address, hex: '01000000', stable: true })) }); });
  } });
  await item.session.start();
  const lease = item.hardware.current;
  item.session.updateVariables([variable, second]);
  finish(); await flush();
  assert.equal(item.frames[0].values.length, 1);
  const next = item.timers.shift()();
  assert.equal(requests[1].length, 2); assert.equal(item.hardware.current, lease);
  item.session.updateVariables([second]); finish(); await next;
  assert.equal(item.frames[1].values.length, 2);
  const last = item.timers.shift()(); assert.deepEqual(requests[2], [second]);
  assert.throws(() => item.session.updateVariables([]), /ELF/);
  assert.throws(() => item.session.updateVariables([second, second]), /ELF/);
  assert.throws(() => item.session.updateVariables([{ ...second, address: 0 }]), /ELF/);
  item.session.stop(); finish(); await last;
  assert.equal(item.hardware.current, null);
});
function setup(overrides = {}) {
  const hardware = createHardwareGate(), states = [], frames = [], timers = [];
  const session = createGlobalWatch({ hardware, ownerId: 'one', uid, elf, variables: [variable],
    verify: async () => identity, read: async () => ({ ...identity, values: [{ address: variable.address, hex: 'e7030000', stable: true }] }),
    schedule: callback => { timers.push(callback); return callback; }, cancel: () => {},
    onState: state => states.push(state), onFrame: frame => frames.push(frame), ...overrides });
  return { hardware, session, states, frames, timers };
}
test('decode numeric scalars with little endian and exact large integers', () => {
  const decode = (kind, size, hex, stable = true) => decodeVariable({ ...variable, kind, size }, { address: variable.address, hex, stable });
  assert.equal(decode('unsigned', 4, 'e7030000').value, 999);
  assert.equal(decode('signed', 4, '0cfeffff').value, -500);
  assert.equal(decode('float', 4, '0000c841').value, 25);
  assert.equal(decode('float', 8, '0000000000003940').value, 25);
  assert.equal(decode('bool', 1, '01').value, 1);
  assert.equal(decode('unsigned', 8, 'ffffffffffffffff').value, '18446744073709551615');
  assert.equal(decode('signed', 8, '0000000000000080').value, '-9223372036854775808');
  assert.equal(decode('unsigned', 4, 'e7030000', false).valid, false);
  assert.equal(decode('float', 4, '0000c07f').valid, false);
  assert.throws(() => decode('unsigned', 4, '0000'), /boyut/);
  assert.throws(() => decodeVariable(variable, { address: 0, hex: '00000000' }), /adres/);
});
test('watch verifies identity, decodes reads and releases on stop', async () => {
  const { session, hardware, frames, timers } = setup();
  await session.start(); await flush();
  assert.equal(frames[0].values[0].value, 999);
  assert.equal(timers.length, 1); assert.ok(hardware.current);
  session.stop(); assert.equal(hardware.current, null);
  await timers[0](); assert.equal(frames.length, 1);
});
test('stop retains the hardware lease until verification finishes', async () => {
  let finish; const { session, hardware, frames } = setup({ verify: () => new Promise(resolve => { finish = resolve; }) });
  const start = session.start(); session.stop();
  assert.throws(() => hardware.acquire('two', 'flash'), /Başka/);
  finish(identity); await start;
  assert.equal(hardware.current, null); assert.equal(frames.length, 0);
});
test('initial phases are visible and cancellation settles only after the device responds', async () => {
  let verified, readDone;
  const item = setup({ verify: () => new Promise(resolve => { verified = resolve; }), read: () => new Promise(resolve => { readDone = resolve; }) });
  const start = item.session.start();
  assert.equal(item.states.at(-1).status, 'verifying');
  await assert.rejects(item.session.start(), /zaten/);
  verified(identity); await start;
  assert.equal(item.states.at(-1).status, 'reading');
  item.session.stop();
  assert.equal(item.states.at(-1).status, 'stopping'); assert.ok(item.hardware.current);
  readDone({ ...identity, values: [{ address: variable.address, hex: 'e7030000', stable: true }] });
  await flush();
  assert.equal(item.states.at(-1).status, 'paused'); assert.equal(item.hardware.current, null);
  assert.equal(item.frames.length, 0);
});
test('string transport errors remain readable and eventually free the lease', async () => {
  const item = setup({ verify: async () => { throw 'ESP yanıtı zaman aşımı'; } });
  await item.session.start();
  assert.equal(item.states.at(-1).status, 'error');
  assert.equal(item.states.at(-1).message, 'ESP yanıtı zaman aşımı'); assert.equal(item.hardware.current, null);
});
test('stop retains the lease until pending read finishes and discards its result', async () => {
  let finish; const { session, hardware, frames } = setup({ read: () => new Promise(resolve => { finish = resolve; }) });
  await session.start(); session.stop(); assert.ok(hardware.current);
  finish({ ...identity, values: [{ address: variable.address, hex: 'e7030000', stable: true }] }); await flush();
  assert.equal(hardware.current, null); assert.equal(frames.length, 0);
});
test('wrong ELF, changed target and expired session stop without displaying values', async () => {
  for (const failure of [{ ...identity, sha256: 'b'.repeat(64) }, { ...identity, uid: 'a'.repeat(24) }, { ...identity, session: 'other', values: [] }, { valid: false, reason: 'ELF_FIRMWARE_MISMATCH' }]) {
    const { session, frames, hardware, states } = setup({ read: async () => failure });
    await session.start(); await flush();
    assert.equal(frames.length, 0); assert.equal(states.at(-1).status, 'error'); assert.equal(hardware.current, null);
  }
});
test('three network failures stop monitoring; requests never overlap', async () => {
  const { session, timers, hardware, states } = setup({ read: async () => { throw new Error('Network offline'); } });
  await session.start(); await flush();
  await timers.shift()(); await timers.shift()();
  assert.equal(states.at(-1).status, 'error'); assert.equal(hardware.current, null);
});
test('duplicate variables and foreign ELF variables are rejected before transport', async () => {
  for (const variables of [[variable, variable], [{ ...variable, address: 0x20000008 }], []]) {
    const { session, hardware } = setup({ variables }); await assert.rejects(session.start(), /ELF/); assert.equal(hardware.current, null);
  }
});
test('CSV preserves identity and avoids formula injection', () => {
  const csv = globalWatchCsv([{ receivedAt: 0, uid, values: [{ ...variable, name: '=run()', value: 999, valid: true }] }]);
  assert.match(csv, /uid.*name/); assert.match(csv, /'=run\(\)/); assert.match(csv, /999/);
});
test('confirmed mismatch reloads once under the same lease and re-verifies before reading', async () => {
  let verifies = 0, reloads = 0;
  const mismatch = { valid: false, reason: 'ELF_FIRMWARE_MISMATCH', mismatchConfirmed: true, uid, sha256: hash };
  const item = setup({ verify: async () => ++verifies === 1 ? mismatch : identity,
    reloadFirmware: async (lease, isStopped) => { reloads++; assert.ok(item.hardware.owns(lease)); assert.equal(isStopped(), false); } });
  await item.session.start(); await flush();
  assert.equal(reloads, 1); assert.equal(verifies, 2); assert.equal(item.frames.length, 1);
  item.session.stop();
});
test('unknown read failures, unconfirmed mismatch and wrong identity cannot cause flashing', async () => {
  for (const result of [
    { valid: false, reason: 'FLASH_READ_FAILED' },
    { valid: false, reason: 'ELF_FIRMWARE_MISMATCH' },
    { valid: false, reason: 'ELF_FIRMWARE_MISMATCH', mismatchConfirmed: true, uid: 'a'.repeat(24), sha256: hash },
  ]) {
    let reloads = 0;
    const item = setup({ verify: async () => result, reloadFirmware: async () => { reloads++; } });
    await item.session.start(); assert.equal(reloads, 0); assert.equal(item.frames.length, 0); assert.equal(item.hardware.current, null);
  }
});
test('failed reload or repeated mismatch never loops or reads RAM', async () => {
  for (const fails of [true, false]) {
    let reloads = 0;
    const item = setup({ verify: async () => ({ valid: false, reason: 'ELF_FIRMWARE_MISMATCH', mismatchConfirmed: true, uid, sha256: hash }),
      reloadFirmware: async () => { reloads++; if (fails) throw new Error('Yükleme hatası'); } });
    await item.session.start(); assert.equal(reloads, 1); assert.equal(item.frames.length, 0); assert.equal(item.hardware.current, null); assert.equal(item.states.at(-1).status, 'error');
  }
});
test('stopping during reload retains lease until it finishes and skips RAM reads', async () => {
  let finish;
  const item = setup({ verify: async () => ({ valid: false, reason: 'ELF_FIRMWARE_MISMATCH', mismatchConfirmed: true, uid, sha256: hash }),
    reloadFirmware: () => new Promise(resolve => { finish = resolve; }) });
  const pending = item.session.start(); await flush(); item.session.stop();
  assert.ok(item.hardware.current); assert.throws(() => item.hardware.acquire('other', 'flash'), /Başka/);
  finish(); await pending; assert.equal(item.hardware.current, null); assert.equal(item.frames.length, 0);
});
