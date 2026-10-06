import assert from 'node:assert/strict';
import test from 'node:test';
import { createHardwareGate } from './hardwareGate.js';
import { createTelemetrySession, validateTelemetry, telemetryCsv } from './telemetry.js';
const uid = '001300155231501920323239';
const frame = () => ({ connected: true, valid: true, uid, abi: 1, sequence: 2, timestampMs: 100, sampleCounter: 1,
  testIdHash: 1, profileHash: 2, runHash: 3, sensorStatus: 1, channels: [{ name: 'pressure', unit: 'Pa', value: 69964, valid: true }] });
const settle = () => new Promise(resolve => setImmediate(resolve));
test('invalid frames and a foreign UID/run are rejected', () => {
  assert.throws(() => validateTelemetry({ ...frame(), uid: 'a'.repeat(24) }, uid));
  assert.throws(() => validateTelemetry({ ...frame(), channels: [{ name: 'x', unit: '', value: NaN, valid: true }] }, uid));
  assert.throws(() => validateTelemetry(frame(), uid, { testIdHash: 1, profileHash: 2, runHash: 4 }));
  assert.throws(() => validateTelemetry({ ...frame(), sequence: 3 }, uid));
});
test('stopping retains the gate until the in-flight request finishes', async () => {
  const gate = createHardwareGate(); let resolve;
  const frames = [];
  const session = createTelemetrySession({ hardware: gate, ownerId: 'live', uid,
    fetchSample: () => new Promise(r => { resolve = r; }), onFrame: f => frames.push(f) });
  session.start(); session.stop();
  assert.throws(() => gate.acquire('flash', 'flash'));
  resolve(frame()); await settle();
  assert.equal(gate.current, null); assert.equal(frames.length, 0);
});
test('duplicates become stale and changed firmware stops the session', async () => {
  const gate = createHardwareGate(); let next, now = 0, current = frame(); const frames = [], states = [];
  const session = createTelemetrySession({ hardware: gate, ownerId: 'live', uid, clock: () => now,
    fetchSample: async () => current, schedule: fn => { next = fn; return 1; }, cancel: () => {},
    onFrame: f => frames.push(f), onState: s => states.push(s) });
  session.start(); await settle(); assert.equal(frames[0].stale, false);
  now = 3000; await next(); assert.equal(frames.at(-1).stale, true);
  assert.equal(frames.at(-1).newSample, false);
  current = { ...current, runHash: 99 }; await next();
  assert.equal(states.at(-1).status, 'error'); assert.equal(gate.current, null);
});
test('CSV preserves units, validity and neutralizes spreadsheet formulas', () => {
  const csv = telemetryCsv([{ ...frame(), receivedAt: 1000, channels: [{ name: '=cmd', unit: '', value: 3, valid: false }] }]);
  assert.match(csv, /"'=cmd"/); assert.match(csv, /"false"/); assert.match(csv, /sample_counter/);
});
test('counter wrap is accepted, MCU reset is not', async () => {
  const gate = createHardwareGate(); let next, current = { ...frame(), sampleCounter: 0xffffffff, timestampMs: 0xfffffff0 };
  const frames = [], states = [];
  const session = createTelemetrySession({ hardware: gate, ownerId: 'live', uid,
    fetchSample: async () => current, schedule: fn => { next = fn; return 1; }, cancel: () => {},
    onFrame: f => frames.push(f), onState: s => states.push(s) });
  session.start(); await settle(); current = { ...frame(), sampleCounter: 0, timestampMs: 10 };
  await next(); assert.equal(frames.at(-1).newSample, true);
  current = { ...frame(), sampleCounter: 10, timestampMs: 100 }; await next();
  current = { ...frame(), sampleCounter: 1, timestampMs: 20 }; await next();
  assert.equal(states.at(-1).status, 'error'); assert.equal(gate.current, null);
});
test('persistent transport failures stop and release SWD', async () => {
  const gate = createHardwareGate(); let next, calls = 0; const states = [];
  const session = createTelemetrySession({ hardware: gate, ownerId: 'live', uid,
    fetchSample: async () => { calls++; throw new Error('timeout'); },
    schedule: fn => { next = fn; return 1; }, cancel: () => {}, onState: s => states.push(s) });
  session.start(); await settle(); await next(); await next();
  assert.equal(calls, 3); assert.equal(states.at(-1).status, 'error'); assert.equal(gate.current, null);
});
test('MCU model mismatch stops before presenting a sample', async () => {
  const gate = createHardwareGate(), frames = [], states = [];
  const session = createTelemetrySession({ hardware: gate, ownerId: 'live', uid, expectedModel: 'STM32F446',
    fetchSample: async () => ({ ...frame(), model: 'STM32F401' }),
    onFrame: value => frames.push(value), onState: value => states.push(value) });
  session.start(); await settle();
  assert.equal(frames.length, 0); assert.equal(states.at(-1).status, 'error'); assert.equal(gate.current, null);
});
