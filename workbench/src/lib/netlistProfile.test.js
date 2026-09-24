import assert from 'node:assert/strict';
import test from 'node:test';
import { profileFromNetlist } from './netlistProfile.js';
import { validateTestTarget } from './boardProfile.js';
import { DEFAULT_TEST_CATALOG, testForComponent } from './testCatalog.js';

const miniNetlist = `Wire List
<<< Component List >>>
STM32F401CCU6 U1 STM32F401CCU6
BMP180 U2 Pressure sensor
W25Q256JV U3 Flash memory
MCP2551 U4 CAN transceiver
<<< Wire List >>>
[00001] SENSOR_SCL
 U1 1 PB6 PASSIVE STM32F401CCU6
 U2 1 SCL PASSIVE BMP180
[00002] SENSOR_SDA
 U1 2 PB7 PASSIVE STM32F401CCU6
 U2 2 SDA PASSIVE BMP180
`;

test('small Altium NET recognizes MCU, sensor, memory and transceiver by part number', () => {
  const { profile } = profileFromNetlist(miniNetlist);
  assert.equal(profile.mcu.part, 'STM32F401CCU6');
  assert.deepEqual(Object.fromEntries(profile.components.map((item) => [item.ref, item.category])), {
    U2: 'BAROMETER', U3: 'MEMORY', U4: 'TRANSCEIVER',
  });
  assert.deepEqual(profile.connections.map((item) => [item.role, item.mcuPin]), [['SCL', 'PB6'], ['SDA', 'PB7']]);
  assert.deepEqual(profile.connections.map((item) => item.peripheral), ['I2C1', 'I2C1']);
  assert.equal(profile.connections[0].confidence, 60, 'inferred peripheral is not a named-net evidence');
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, profile.components[0], profile.mcu.part)?.id, 'bmp180');
  assert.equal(validateTestTarget(profile, 'U2').valid, false, 'parser output needs human pin approval');
  profile.connections.forEach((item) => { item.approved = true; });
  assert.equal(validateTestTarget(profile, 'U2').valid, true);
});

test('custom I2C netlist automatically receives a software bus, pending approval', () => {
  const custom = miniNetlist.replaceAll('STM32F401CCU6', 'STM32F446RET6').replaceAll('PB6', 'PA0').replaceAll('PB7', 'PA1');
  const { profile } = profileFromNetlist(custom);
  assert.deepEqual(profile.connections.map((item) => item.peripheral), ['SOFT_I2C_1', 'SOFT_I2C_1']);
  assert.equal(validateTestTarget(profile, 'U2').valid, false);
  profile.connections.forEach((item) => { item.approved = true; });
  assert.equal(validateTestTarget(profile, 'U2').valid, true);
});
