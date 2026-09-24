import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newBoardProfile,
  overallConfidence,
  supportedPeripheral,
  validateTestTarget,
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

test('shared I2C pins are valid, but an unapproved sensor cannot be tested', () => {
  const profile = newBoardProfile({ name: 'Two sensors', mcuPart: 'STM32F401CCU6' });
  profile.components = [{ ref: 'U1' }, { ref: 'U2' }];
  profile.connections = ['U1', 'U2'].flatMap((ref) => [
    { componentRef: ref, role: 'SCL', mcuPin: 'PB6', peripheral: 'I2C1', approved: ref === 'U1' },
    { componentRef: ref, role: 'SDA', mcuPin: 'PB7', peripheral: 'I2C1', approved: ref === 'U1' },
  ]);
  assert.equal(validateBoardProfile(profile).valid, true);
  assert.equal(validateTestTarget(profile, 'U1').valid, true);
  assert.equal(validateTestTarget(profile, 'U2').valid, false);
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

test('software I2C accepts custom GPIO while excluding SWD and unavailable package pins', () => {
  const profile = newBoardProfile({ name: 'Breadboard BMP180', mcuPart: 'STM32F401CCU6' });
  profile.components = [{ ref: 'U2', part: 'BMP180', protocol: 'I2C' }];
  profile.connections = [
    { componentRef: 'U2', role: 'SCL', mcuPin: 'PB0', peripheral: 'SOFT_I2C_1', approved: true },
    { componentRef: 'U2', role: 'SDA', mcuPin: 'PB1', peripheral: 'SOFT_I2C_1', approved: true },
  ];
  assert.equal(validateTestTarget(profile, 'U2').valid, true);
  assert.equal(supportedPeripheral('STM32F401CCU6', 'SOFT_I2C_1', 'SCL', 'PA13').supported, false);
  assert.equal(supportedPeripheral('STM32F401CCU6', 'SOFT_I2C_1', 'SCL', 'PC9').supported, false);
  assert.equal(supportedPeripheral('STM32F446RET6', 'SOFT_I2C_1', 'SDA', 'PC9').supported, true);
});

test('manual source does not turn parser confidence into 100 percent', () => {
  const profile = newBoardProfile({ mcuPart: 'STM32F401CCU6' });
  profile.connections = [{ componentRef: 'U2', role: 'SCL', mcuPin: 'PB0', peripheral: 'SOFT_I2C_1', source: 'USER', approved: true, evidence: {} }];
  assert.equal(overallConfidence(profile), 0);
});
