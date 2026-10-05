import { searchLibrary } from './testLibrary.js';

// Filter choices are not test artifacts. Availability always comes from real library entries.
export const SENSOR_GROUPS = [
  { id: 'imu', label: 'IMU', parts: ['BHI360', 'MPU6050', 'ICM20948'] },
  { id: 'pressure', label: 'Barometre', parts: ['BMP180', 'BME280', 'MS5611'] },
  { id: 'radio', label: 'Haberleşme', parts: ['RFM98W', 'SX1278'] },
  { id: 'gpio', label: 'GPIO / LED', parts: ['LED'] },
  { id: 'other', label: 'Diğer', parts: [] },
];
export const partKey = value => String(value || '').trim().toUpperCase();
export function sensorGroup(part) {
  const key = partKey(part);
  return SENSOR_GROUPS.find(group => group.parts.includes(key))?.id || 'other';
}
export function librarySensorChoices(entries) {
  const parts = new Set(SENSOR_GROUPS.flatMap(group => group.parts));
  entries.forEach(entry => parts.add(partKey(entry.component?.part)));
  return [...parts].filter(Boolean).map(part => ({ part, group: sensorGroup(part),
    count: entries.filter(entry => partKey(entry.component?.part) === part).length }));
}
export function filterLibrary(entries, { query = '', category = 'all', parts = [], result = 'all', mcu = 'all' } = {}) {
  const selected = new Set(parts.map(partKey));
  return searchLibrary(entries, query).filter(entry =>
    (category === 'all' || sensorGroup(entry.component?.part) === category)
    && (!selected.size || selected.has(partKey(entry.component?.part)))
    && (result === 'all' || entry.result?.status === result)
    && (mcu === 'all' || entry.board?.mcu === mcu || entry.supportedMcu?.some(family => mcu.startsWith(family))));
}
