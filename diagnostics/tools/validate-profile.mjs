import { readFile } from 'node:fs/promises';

const encoded = process.argv[2];
if (!encoded) throw new Error('BoardProfile JSON argümanı zorunludur.');
const profile = encoded.startsWith('@')
  ? JSON.parse(await readFile(encoded.slice(1), 'utf8'))
  : JSON.parse(encoded);

if (profile.schemaVersion !== 1) throw new Error('Desteklenmeyen BoardProfile sürümü.');
if (!['STM32F401', 'STM32F446'].includes(profile.mcu?.family)) throw new Error('Yalnız STM32F401/F446 desteklenir.');
if (!Array.isArray(profile.connections) || profile.connections.length === 0) throw new Error('En az bir onaylı bağlantı gerekir.');
const occupied = new Map();
for (const item of profile.connections) {
  if (!item.approved) throw new Error(`${item.componentRef}:${item.role} onaylanmamış.`);
  if (!/^P[A-K]\d{1,2}$/.test(item.mcuPin || '')) throw new Error(`Geçersiz MCU pini: ${item.mcuPin}`);
  const prior = occupied.get(item.mcuPin);
  const shared = prior && ['SCL', 'SDA', 'SCK', 'MISO', 'MOSI'].includes(item.role)
    && prior.role === item.role && prior.peripheral === item.peripheral;
  if (prior && !shared) throw new Error(`Pin çakışması: ${item.mcuPin}`);
  occupied.set(item.mcuPin, item);
}
console.log(JSON.stringify({ valid: true, profileId: profile.id, mcu: profile.mcu.family, connections: profile.connections.length }));
