import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSchematicPages } from './schematicEvidence.js';
test('PDF corroborates parts on the same page without claiming wire verification', () => {
  const profile = { mcu: { part: 'STM32F446RET6' }, components: [{ ref: 'IC6', part: 'BMP581' }, { ref: 'IC4', part: 'BHI360' }] };
  const result = compareSchematicPages([{ number: 2, text: 'IC6 BMP581' }, { number: 3, text: 'STM32F446RET6 IC4' }], profile);
  assert.deepEqual(result.mcuPages, [3]); assert.equal(result.matched, 1);
  assert.deepEqual(result.components[0].pages, [2]); assert.equal(result.wiringConfirmed, false);
  assert.equal(compareSchematicPages([{ number: 2, text: 'IC60 BMP5810' }], profile).matched, 0);
});
test('image-only PDFs remain unverified', () => {
  const result = compareSchematicPages([{ number: 1, text: '' }], { mcu: { part: 'STM32F446RET6' }, components: [] });
  assert.equal(result.textAvailable, false); assert.equal(result.wiringConfirmed, false);
});
