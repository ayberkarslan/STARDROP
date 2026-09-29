import assert from 'node:assert/strict';
import test from 'node:test';
import { pinKind, pinNumberFor, targetPackage } from './targetPins.js';

test('F401 48-pin package preserves physical numbering', () => {
  const target = targetPackage('STM32F401CDU6');
  assert.equal(target.pins.length, 48);
  assert.equal(pinNumberFor('STM32F401CDU6', 'PC13'), 2);
  assert.equal(pinNumberFor('STM32F401CDU6', 'PB10'), 23);
  assert.equal(pinNumberFor('STM32F401CDU6', 'PA13'), 34);
  assert.equal(pinNumberFor('STM32F401CDU6', 'PC4'), null);
});

test('F446 64-pin package maps BHI360 fixture pins and excludes absent PB11', () => {
  const target = targetPackage('STM32F446RET6');
  assert.equal(target.pins.length, 64);
  assert.equal(pinNumberFor('STM32F446RET6', 'PC4'), 24);
  assert.equal(pinNumberFor('STM32F446RET6', 'PC5'), 25);
  assert.equal(pinNumberFor('STM32F446RET6', 'PB10'), 29);
  assert.equal(pinNumberFor('STM32F446RET6', 'PB3'), 55);
  assert.equal(pinNumberFor('STM32F446RET6', 'PB11'), null);
  assert.equal(pinKind('PA13'), 'swd');
});
