import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterLibrary, librarySensorChoices, sensorGroup } from './libraryFilters.js';
const entry = (part, status, mcu = 'STM32F401CDU6') => ({ name: part + ' testi', note: '', author: 'ekip', board: { name: 'Kart', mcu }, component: { part, protocol: 'I2C' }, test: { name: 'Test' }, result: { status }, pins: [{ role: 'SCL', mcuPin: 'PB6' }] });
const entries = [entry('BHI360', 'PASS'), entry('MPU6050', 'FAIL'), entry('BME280', 'NOT_RUN', 'STM32F446RET6'), entry('CUSTOM123', 'NOT_RUN')];
test('category, sensor, MCU, result and free-text filters combine', () => {
  assert.equal(filterLibrary(entries, { category: 'imu' }).length, 2);
  assert.deepEqual(filterLibrary(entries, { category: 'imu', parts: ['mpu6050'], result: 'FAIL', mcu: 'STM32F401CDU6', query: 'PB6' }), [entries[1]]);
  assert.equal(filterLibrary(entries, { category: 'pressure', result: 'PASS' }).length, 0);
  assert.equal(filterLibrary(entries, { mcu: 'STM32F446RET6' }).length, 1);
  assert.deepEqual(filterLibrary(entries), entries);
});
test('example sensors do not create imaginary runnable library records', () => {
  assert.equal(librarySensorChoices([]).find(item => item.part === 'BMP180').count, 0);
  assert.deepEqual(filterLibrary([], { parts: ['BMP180'] }), []);
});
test('new sensors automatically appear without losing unknown component types', () => {
  assert.equal(sensorGroup('CUSTOM123'), 'other');
  assert.equal(librarySensorChoices(entries).find(item => item.part === 'CUSTOM123').count, 1);
  assert.deepEqual(filterLibrary(entries, { category: 'other' }), [entries[3]]);
  assert.equal(sensorGroup(' bhi360 '), 'imu');
});
