import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileFromNetlist } from './netlistProfile.js';
import { testForComponent, validateTestCatalog } from './testCatalog.js';
const catalog = JSON.parse(readFileSync(new URL('../../../code-repo/catalog/catalog.json', import.meta.url), 'utf8'));
test('OBC BMP581 maps to the correct source and software bus, not BMP180', () => {
  assert.equal(validateTestCatalog(catalog).valid, true);
  const { profile } = profileFromNetlist(readFileSync(new URL('../../../parse_algorithm/test.net', import.meta.url), 'utf8'));
  const bmp = profile.components.find(component => component.part === 'BMP581');
  assert.equal(bmp.ref, 'IC6'); assert.match(bmp.peripheral, /^SOFT_I2C_/);
  const pins = Object.fromEntries(profile.connections.filter(connection => connection.componentRef === 'IC6').map(connection => [connection.role, connection.mcuPin]));
  assert.deepEqual(pins, { INT: 'PA9', SCL: 'PA8', SDA: 'PB4' });
  assert.equal(testForComponent(catalog, bmp, profile.mcu.part).id, 'bmp581-f446');
  assert.equal(testForComponent(catalog, bmp, 'STM32F401CDU6'), null);
});
