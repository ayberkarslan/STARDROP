import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TEST_CATALOG, buildableTargetPart, testForComponent, testsForComponent, validateTestCatalog } from './testCatalog.js';
import CODE_REPO_CATALOG from '../../../code-repo/catalog/catalog.json' with { type: 'json' };

test('sensor testing requires a matching device-specific test', () => {
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'BMP180', protocol: 'I2C' }, 'STM32F401CCU6').id, 'bmp180');
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'BMP581', protocol: 'I2C' }, 'STM32F446RE'), null);
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'unknown', protocol: 'SPI' }, 'STM32F446RE'), null);
});

test('catalog and prototype MCU restrictions are explicit', () => {
  assert.equal(validateTestCatalog(DEFAULT_TEST_CATALOG).valid, true);
  assert.equal(buildableTargetPart('STM32F401CCU6'), true);
  assert.equal(buildableTargetPart('STM32F401CDU6'), true);
  assert.equal(buildableTargetPart('STM32F401RE'), false);
  assert.equal(buildableTargetPart('STM32F446RET6'), true);
});

test('GitHub code catalog resolves LED test without hardcoded board reference', () => {
  assert.equal(validateTestCatalog(CODE_REPO_CATALOG).valid, true);
  assert.equal(testForComponent(CODE_REPO_CATALOG, { part: 'LED', protocol: 'GPIO' }, 'STM32F401CDU6')?.id, 'led-blink');
  assert.equal(testForComponent(CODE_REPO_CATALOG, { part: 'LED', protocol: 'GPIO' }, 'STM32F446RET6'), null);
});

test('multiple sensor test variants are filtered by part, protocol, MCU and readiness', () => {
  const catalog = { tests: [
    { id: 'mpu-accel', status: 'ready', protocol: 'I2C', matchParts: ['MPU6050'], supportedMcu: ['STM32F401'] },
    { id: 'mpu-full', status: 'ready', protocol: 'I2C', matchParts: ['MPU6050'], supportedMcu: ['STM32F401'] },
    { id: 'mpu-future', status: 'planned', protocol: 'I2C', matchParts: ['MPU6050'], supportedMcu: ['STM32F401'] },
    { id: 'mpu-spi', status: 'ready', protocol: 'SPI', matchParts: ['MPU6050'], supportedMcu: ['STM32F401'] },
  ] };
  const component = { part: 'MPU6050', protocol: 'I2C' };
  assert.deepEqual(testsForComponent(catalog, component, 'STM32F401CDU6', { readyOnly: true }).map((item) => item.id), ['mpu-accel', 'mpu-full']);
  assert.deepEqual(testsForComponent(catalog, component, 'STM32F401CDU6').map((item) => item.id), ['mpu-accel', 'mpu-full', 'mpu-future']);
  assert.deepEqual(testsForComponent(catalog, component, 'STM32F446RET6'), []);
});
