import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TEST_CATALOG, buildableTargetPart, testForComponent, validateTestCatalog } from './testCatalog.js';

test('BMP180 uses specific test, unknown I2C gets bus-only fallback', () => {
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'BMP180', protocol: 'I2C' }, 'STM32F401CCU6').id, 'bmp180');
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'BMP581', protocol: 'I2C' }, 'STM32F446RE').id, 'generic-i2c');
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, { part: 'unknown', protocol: 'SPI' }, 'STM32F446RE'), null);
});

test('catalog and prototype MCU restrictions are explicit', () => {
  assert.equal(validateTestCatalog(DEFAULT_TEST_CATALOG).valid, true);
  assert.equal(buildableTargetPart('STM32F401CCU6'), true);
  assert.equal(buildableTargetPart('STM32F401RE'), false);
  assert.equal(buildableTargetPart('STM32F446RET6'), true);
});
