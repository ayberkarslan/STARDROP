import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newBoardProfile,
  overallConfidence,
  supportedPeripheral,
  validateBoardProfile,
} from './boardProfile.js';

test('F401 I2C1 PB6/PB7 profile is valid', () => {
  const profile = newBoardProfile({ name: 'BlackPill', mcuPart: 'STM32F401CCU6' });
  profile.connections = [
    { componentRef: 'U1', role: 'SCL', mcuPin: 'PB6', peripheral: 'I2C1', approved: true, evidence: { directTrace: true, knownPartPin: true, validAlternateFunction: true } },
    { componentRef: 'U1', role: 'SDA', mcuPin: 'PB7', peripheral: 'I2C1', approved: true, evidence: { directTrace: true, knownPartPin: true, validAlternateFunction: true } },
  ];
  assert.equal(validateBoardProfile(profile).valid, true);
  assert.equal(overallConfidence(profile), 80);
});

test('invalid alternate function and pin collision are rejected', () => {
  const profile = newBoardProfile({ name: 'Bad', mcuPart: 'STM32F446RE' });
  profile.connections = [
    { componentRef: 'U1', role: 'SCL', mcuPin: 'PA0', peripheral: 'I2C1', approved: true },
    { componentRef: 'U2', role: 'SDA', mcuPin: 'PA0', peripheral: 'I2C1', approved: true },
  ];
  const result = validateBoardProfile(profile);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('birlikte kullanılıyor')));
  assert.ok(result.errors.some((error) => error.includes('I2C1/SCL')));
});

test('capability database recognizes documented F446 SPI2 pins', () => {
  assert.equal(supportedPeripheral('STM32F446RE', 'SPI2', 'MOSI', 'PB15').supported, true);
  assert.equal(supportedPeripheral('STM32F446RE', 'SPI2', 'MOSI', 'PA7').supported, false);
});
