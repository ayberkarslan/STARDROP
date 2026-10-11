import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceUserCode, copyDeviceCode } from './deviceCode.js';

test('only a device user code is accepted', () => {
  assert.equal(deviceUserCode(' abcd-1234 '), 'ABCD-1234');
  for (const value of [undefined, 'TEST İÇİN 5000 */', 'ABCD-1234 extra', '']) assert.throws(() => deviceUserCode(value));
});
test('clipboard receives only the code', async () => {
  let copied;
  await copyDeviceCode('ABCD-1234', { navigator: { clipboard: { writeText: async value => { copied = value; } } } });
  assert.equal(copied, 'ABCD-1234');
});
test('WebView fallback selects the exact code and cleans up on success or failure', async () => {
  for (const success of [true, false]) {
    let removed = false, restored = false, selected = false;
    const field = { style: {}, focus() {}, select() { selected = true; }, setSelectionRange(start, end) { assert.deepEqual([start, end], [0, 9]); }, remove() { removed = true; } };
    const browser = { navigator: {}, document: {
      activeElement: { focus() { restored = true; } }, createElement: () => field,
      body: { appendChild() {} }, execCommand(command) { assert.equal(command, 'copy'); assert.equal(field.value, 'ABCD-1234'); return success; },
    } };
    if (success) await copyDeviceCode('ABCD-1234', browser);
    else await assert.rejects(copyDeviceCode('ABCD-1234', browser));
    assert.ok(removed && restored && selected);
  }
});
