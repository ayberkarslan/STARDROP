import assert from 'node:assert/strict';
import test from 'node:test';
import { profileFromNetlist } from './netlistProfile.js';
import { validateTestTarget } from './boardProfile.js';
import { DEFAULT_TEST_CATALOG, testForComponent } from './testCatalog.js';
import { readFileSync } from 'node:fs';
import { pinNumberFor } from './targetPins.js';

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

test('BHI360 fixture maps pins but requires approval before the identity test', () => {
  const netlist = readFileSync(new URL('../../../parse_algorithm/test.net', import.meta.url), 'utf8');
  const { profile, analysis } = profileFromNetlist(netlist);
  const bhi = profile.components.find((item) => item.part.startsWith('BHI360'));
  assert.equal(profile.mcu.part, 'STM32F446RET6');
  assert.equal(bhi?.protocol, 'I2C');
  assert.deepEqual(Object.fromEntries(profile.connections.filter((item) => item.componentRef === bhi.ref)
    .map((item) => [item.role, item.mcuPin])), { INT: 'PC5', RESET: 'PC4', SDA: 'PB3', SCL: 'PB10' });
  for (const pin of analysis.detected_sensors.find((item) => item.ref_designator === bhi.ref).pins) {
    assert.equal(pinNumberFor(profile.mcu.part, pin.mcu_pin_name), Number(pin.mcu_pin_num));
  }
  assert.deepEqual(Object.fromEntries(profile.connections.filter(connection => connection.role === 'LED' && connection.mcuPin)
    .map(connection => [connection.componentRef, connection.mcuPin])), { D6: 'PA15', D7: 'PB7' });
  assert.equal(profile.components.find(component => component.ref === 'D6').activeLow, false);
  assert.deepEqual(profile.components.filter(component => component.powerOnly).map(component => component.ref), ['D3', 'D4', 'D5']);
  assert.equal(validateTestTarget(profile, bhi.ref).valid, false);
  assert.equal(testForComponent(DEFAULT_TEST_CATALOG, bhi, profile.mcu.part), null);
});

const ledNet = (gpioSide = 'A', railSide = 'GND', via = true) => `Wire List
<<< Component List >>>
STM32F446RET6 U1 MCU
GREEN LD2 User LED
330R R1 Resistor
1N4148 D3 Protection diode
<<< Wire List >>>
[00001] USER_LED
 U1 21 PA5 PASSIVE STM32F446RET6
 ${via ? 'R1 1 1 PASSIVE 330R' : `LD2 1 ${gpioSide} PASSIVE GREEN`}
${via ? `[00002] LED_ANODE
 R1 2 2 PASSIVE 330R
 LD2 1 ${gpioSide} PASSIVE GREEN` : ''}
[00003] ${railSide}
 LD2 2 ${gpioSide === 'A' ? 'K' : 'A'} PASSIVE GREEN
 D3 1 K PASSIVE 1N4148
`;

test('user LED through a series resistor becomes a GPIO test with detected polarity', () => {
  const { profile } = profileFromNetlist(ledNet());
  const led = profile.components.find(component => component.ref === 'LD2');
  assert.equal(led.part, 'LED'); assert.equal(led.displayName, 'USER_LED');
  assert.equal(led.activeLow, false);
  assert.equal(profile.components.some(component => component.ref === 'D3'), false);
  assert.equal(profile.connections[0].mcuPin, 'PA5');
  assert.deepEqual(profile.connections[0].path, ['LED_ANODE', 'R1', 'USER_LED']);
  assert.equal(profile.connections[0].evidence.seriesResistor, true);
  assert.equal(validateTestTarget(profile, 'LD2').valid, false);
  profile.connections[0].approved = true;
  assert.equal(validateTestTarget(profile, 'LD2').valid, true);
});

test('cathode-driven LED detects active low rather than choosing by MCU model', () => {
  const { profile } = profileFromNetlist(ledNet('K', '+3V3', false));
  assert.equal(profile.components[0].activeLow, true);
  assert.equal(profile.connections[0].mcuPin, 'PA5');
});

test('unknown polarity requires a deliberate user choice', () => {
  const { profile } = profileFromNetlist(ledNet().replace('LD2 1 A', 'LD2 1 1').replace('LD2 2 K', 'LD2 2 2'));
  profile.connections[0].approved = true;
  assert.equal(profile.components[0].activeLow, undefined);
  assert.equal(validateTestTarget(profile, 'LD2').valid, false);
  profile.components[0].activeLow = false;
  assert.equal(validateTestTarget(profile, 'LD2').valid, true);
});

test('multiple GPIOs, supply-only LEDs and transistor paths never become automatic outputs', () => {
  for (const net of [ledNet().replace('U1 21 PA5 PASSIVE STM32F446RET6', 'U1 21 PA5 PASSIVE STM32F446RET6\n U1 22 PA6 PASSIVE STM32F446RET6'),
    ledNet().replace('[00001] USER_LED', '[00001] +3V3'),
    ledNet().replaceAll('R1', 'Q1').replace('330R Q1 Resistor', 'MOSFET Q1 Transistor')]) {
    const { profile } = profileFromNetlist(net);
    assert.equal(profile.connections.find(connection => connection.componentRef === 'LD2').mcuPin, null);
    assert.equal(validateTestTarget(profile, 'LD2').valid, false);
  }
});
