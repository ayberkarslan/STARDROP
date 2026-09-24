import { DeterministicBoardParser } from './deterministicNetlistParser.js';
import { confidenceForConnection, newBoardProfile, supportedPeripheral } from './boardProfile.js';

function roleFor(protocol, role) {
  if (protocol === 'I2C') return role === 'SCK' ? 'SCL' : role === 'SDI' ? 'SDA' : role;
  if (protocol === 'SPI') return role === 'SCK' ? 'SCK' : role === 'SDI' ? 'MOSI' : role === 'SDO' ? 'MISO' : role;
  return role;
}

/** Adapts the existing deterministic NET parser into the Workbench's canonical profile. */
export function profileFromNetlist(netlist, { name, netlistName = 'board.NET', bomContent = null } = {}) {
  const parser = new DeterministicBoardParser(netlist, bomContent);
  const analysis = parser.parseAndResolve();
  if (!analysis.is_valid) throw new Error(analysis.validation_errors?.join(' ') || 'NET analizi başarısız.');

  const profile = newBoardProfile({ name: name || netlistName.replace(/\.net$/i, ''), mcuPart: analysis.mcu_part, source: { netlistName } });
  profile.mcu = { ...profile.mcu, confidence: 85, source: 'NET' };
  const softwareBuses = new Map();
  const busFor = (sensor) => {
    if (sensor.detected_protocol !== 'I2C') return sensor.detected_instance || sensor.detected_protocol;
    const scl = sensor.pins.filter((pin) => roleFor('I2C', pin.sensor_pin_role) === 'SCL');
    const sda = sensor.pins.filter((pin) => roleFor('I2C', pin.sensor_pin_role) === 'SDA');
    if (scl.length !== 1 || sda.length !== 1) return sensor.detected_instance || 'I2C';
    const pair = [['SCL', scl[0]], ['SDA', sda[0]]];
    if (sensor.detected_instance && pair.every(([role, pin]) =>
      supportedPeripheral(profile.mcu.part, sensor.detected_instance, role, pin.mcu_pin_name).supported === true)) {
      return sensor.detected_instance;
    }
    if (!pair.every(([role, pin]) => supportedPeripheral(profile.mcu.part, 'SOFT_I2C_1', role, pin.mcu_pin_name).supported === true)) {
      return sensor.detected_instance || 'I2C';
    }
    const key = `${scl[0].mcu_pin_name}/${sda[0].mcu_pin_name}`;
    if (!softwareBuses.has(key)) softwareBuses.set(key, `SOFT_I2C_${softwareBuses.size + 1}`);
    return softwareBuses.get(key);
  };
  const buses = new Map(analysis.detected_sensors.map((sensor) => [sensor.ref_designator, busFor(sensor)]));
  profile.components = analysis.detected_sensors.map((sensor) => ({
    ref: sensor.ref_designator,
    part: sensor.part_name,
    category: sensor.device_type,
    protocol: sensor.detected_protocol,
    peripheral: buses.get(sensor.ref_designator),
  }));
  profile.connections = analysis.detected_sensors.flatMap((sensor) => sensor.pins.map((pin) => {
    const protocol = sensor.detected_protocol;
    const connection = {
      componentRef: sensor.ref_designator,
      componentPart: sensor.part_name,
      role: roleFor(protocol, pin.sensor_pin_role),
      sensorPin: pin.sensor_pin_name,
      mcuPin: pin.mcu_pin_name,
      peripheral: buses.get(sensor.ref_designator),
      approved: false,
      source: 'NET',
      path: pin.net_path,
      evidence: {
        directTrace: pin.connection_mode === 'DIRECT_TRACE',
        namedNet: pin.net_path.some((segment) => /\b(?:I2C\d|SPI\d|USART\d|UART\d|CAN\d)\b/i.test(segment)),
        knownPartPin: pin.sensor_pin_role !== 'GENERAL_IO',
        solderBridge: pin.connection_mode === 'SOLDER_BRIDGE',
      },
    };
    return { ...connection, confidence: confidenceForConnection(connection) };
  }));
  return { profile, analysis };
}
