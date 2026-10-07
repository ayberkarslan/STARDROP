import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHardwareGate } from './hardwareGate.js';
import { createGlobalWatch, decodeVariable, globalWatchCsv } from './globalWatch.js';

const uid = '001300155231501920323239', hash = 'a'.repeat(64);
const variable = { name: 'watch_random', address: 0x20000004, size: 4, kind: 'unsigned', typeName: 'uint32_t' };
const elf = { imageSha256: hash, imageSize: 4000, variables: [variable] };
const identity = { valid: true, uid, sha256: hash, session: 'test-session' };
const flush = () => new Promise(resolve => setImmediate(resolve));
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
