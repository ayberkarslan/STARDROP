import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHardwareGate } from './hardwareGate.js';

test('a second click cannot acquire transport before the first await finishes', async () => {
  const gate = createHardwareGate();
  let finish;
  const first = gate.run('test-a', 'Derleme ve yükleme', () => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(gate.run('test-b', 'Flash analizi', () => {}), /Başka donanım işlemi/);
  assert.equal(gate.current.ownerId, 'test-a');
  finish('done');
  assert.equal(await first, 'done');
  assert.equal(gate.current, null);
});
test('only an exact lease can release or reuse the transport', () => {
  const gate = createHardwareGate();
  const lease = gate.acquire('a', 'test');
  assert.equal(gate.owns({ ...lease }), false);
  assert.equal(gate.release({ ...lease }), false);
  assert.equal(gate.owns(lease), true);
  gate.release(lease);
  const second = gate.acquire('b', 'test');
  assert.equal(gate.release(lease), false);
  assert.equal(gate.owns(second), true);
});
test('failure releases the lease without transferring results to another owner', async () => {
  const gate = createHardwareGate();
  await assert.rejects(gate.run('a', 'read', () => { throw new Error('offline'); }), /offline/);
  assert.equal(gate.current, null);
});
