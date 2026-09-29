import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newBoardProfile,
  createManualI2cProfile,
  createManualLedProfile,
  addManualPeripheral,
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
  assert.equal(supportedPeripheral('STM32F401CDU6', 'SPI3', 'SCK', 'PC10').supported, false);
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

test('breadboard profile starts unapproved and uses chosen software I2C pins', () => {
  const profile = createManualI2cProfile({ name: 'Bench', mcuPart: 'STM32F401CDU6', componentRef: 'U2', componentPart: 'BMP180', scl: 'pb0', sda: 'pb1' });
  assert.deepEqual(profile.connections.map((item) => item.mcuPin), ['PB0', 'PB1']);
  assert.equal(profile.connections.every((item) => !item.approved), true);
  assert.equal(overallConfidence(profile), 0);
  assert.throws(() => createManualI2cProfile({ name: 'Bad', mcuPart: 'STM32F401CDU6', componentRef: 'U2', componentPart: 'BMP180', scl: 'PA13', sda: 'PB1' }), /yazılımsal I²C/);
});

test('LED profile validates BlackPill PC13 and rejects SWD pins', () => {
  const profile = createManualLedProfile({ name: 'BlackPill', mcuPart: 'STM32F401CCU6', pin: 'pc13', activeLow: true, blinkMs: 100 });
  assert.equal(profile.connections[0].mcuPin, 'PC13');
  assert.equal(profile.components[0].activeLow, true);
  assert.equal(validateTestTarget(profile, 'D1').valid, false);
  profile.connections[0].approved = true;
  assert.equal(validateTestTarget(profile, 'D1').valid, true);
  assert.throws(() => createManualLedProfile({ name: 'Bad', mcuPart: 'STM32F401CCU6', pin: 'PA13' }), /uygun değil/);
  assert.throws(() => createManualLedProfile({ name: 'Bad', mcuPart: 'STM32F401CCU6', pin: 'PC9' }), /paketinde bulunmuyor/);
  assert.equal(createManualLedProfile({ name: 'Nucleo', mcuPart: 'STM32F446RET6', pin: 'PC9' }).connections[0].mcuPin, 'PC9');
});

test('missing LED can be added to a parsed board without replacing its sensors', () => {
  const parsed = createManualI2cProfile({ name: 'Aviyonik', mcuPart: 'STM32F401CDU6', componentRef: 'U2', componentPart: 'MPU6050', scl: 'PB6', sda: 'PB7' });
  const next = addManualPeripheral(parsed, { part: 'LED', protocol: 'GPIO', ref: 'D1', pins: { LED: 'PC13' } });
  assert.deepEqual(next.components.map((item) => item.ref), ['U2', 'D1']);
  assert.equal(next.connections.at(-1).mcuPin, 'PC13');
  assert.throws(() => addManualPeripheral(next, { part: 'LED', protocol: 'GPIO', ref: 'D1', pins: { LED: 'PA5' } }), /benzersiz/);
});

test('manual component can be staged before conflicting default pins are corrected', () => {
  const board = createManualLedProfile({ name: 'Bench', mcuPart: 'STM32F401CDU6', pin: 'PC13' });
  const staged = addManualPeripheral(board, { part: 'LED', protocol: 'GPIO', ref: 'D2', pins: { LED: 'PC13' } });
  assert.equal(staged.components.length, 2);
  assert.equal(validateBoardProfile(staged).valid, false);
});

test('manual SPI sensor accepts valid data pins and a separate chip-select GPIO', () => {
  const board = newBoardProfile({ name: 'Bench', mcuPart: 'STM32F401CDU6' });
  const next = addManualPeripheral(board, { part: 'MS5611', protocol: 'SPI', ref: 'U2', pins: { SCK: 'PA5', MISO: 'PA6', MOSI: 'PA7', CS: 'PB0' } });
  assert.equal(validateBoardProfile(next).valid, true);
  next.connections.forEach((item) => { item.approved = true; });
  assert.equal(validateTestTarget(next, 'U2').valid, true);
});

test('test-specific I2C roles keep SCL and SDA on one bus even with IRQ present', () => {
  const profile = createManualI2cProfile({ name: 'IMU', mcuPart: 'STM32F446RET6', componentRef: 'U2', componentPart: 'BHI360-IMU', scl: 'PB10', sda: 'PB3' });
  profile.connections.push({ componentRef: 'U2', role: 'INT', sensorPin: 'HIRQ', mcuPin: 'PC5', peripheral: 'SOFT_I2C_1', approved: true });
  profile.connections.forEach((item) => { item.approved = true; });
  assert.equal(validateTestTarget(profile, 'U2', ['SCL', 'SDA', 'INT']).valid, true);
  profile.connections[1].peripheral = 'I2C1';
  assert.match(validateTestTarget(profile, 'U2', ['SCL', 'SDA', 'INT']).errors.join(' '), /aynı I2C bus/);
});
