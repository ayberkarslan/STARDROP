import { DeterministicBoardParser } from '../../../parse_algorithm/frontend/src/lib/parser.js';
import { confidenceForConnection, newBoardProfile } from './boardProfile.js';

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
  profile.components = analysis.detected_sensors.map((sensor) => ({
    ref: sensor.ref_designator,
    part: sensor.part_name,
    category: sensor.device_type,
    protocol: sensor.detected_protocol,
    peripheral: sensor.detected_instance,
  }));
  profile.connections = analysis.detected_sensors.flatMap((sensor) => sensor.pins.map((pin) => {
    const protocol = sensor.detected_protocol;
    const connection = {
      componentRef: sensor.ref_designator,
      componentPart: sensor.part_name,
      role: roleFor(protocol, pin.sensor_pin_role),
      sensorPin: pin.sensor_pin_name,
      mcuPin: pin.mcu_pin_name,
      peripheral: sensor.detected_instance || protocol,
      approved: false,
      source: 'NET',
      path: pin.net_path,
      evidence: {
        directTrace: pin.connection_mode === 'DIRECT_TRACE',
        namedNet: Boolean(sensor.detected_instance),
        knownPartPin: pin.sensor_pin_role !== 'GENERAL_IO',
        solderBridge: pin.connection_mode === 'SOLDER_BRIDGE',
      },
    };
    return { ...connection, confidence: confidenceForConnection(connection) };
  }));
  return { profile, analysis };
}
