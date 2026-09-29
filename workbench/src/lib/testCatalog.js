import seedCatalog from '../../../diagnostics/catalog/catalog.json' with { type: 'json' };
import { canonicalMcu } from './boardProfile.js';

export const DEFAULT_TEST_CATALOG = seedCatalog;
const ROLES = new Set(['LED', 'SCL', 'SDA', 'SCK', 'MISO', 'MOSI', 'CS', 'INT', 'RESET']);
const PROTOCOLS = new Set(['GPIO', 'I2C', 'SPI']);

export function deviceForComponent(catalog, component) {
  const part = String(component?.part || '').toUpperCase();
  const protocol = component?.protocol;
  return (catalog?.devices || []).find((device) => device.protocols?.includes(protocol)
    && device.matchParts?.some((alias) => {
      const name = String(alias).toUpperCase();
      return part === name || part.startsWith(`${name}-`) || part.startsWith(`${name}_`);
    })) || null;
}

export function buildableTargetPart(part) {
  const normalized = String(part || '').toUpperCase();
  return /^STM32F401C[CDE]/.test(normalized) || normalized.startsWith('STM32F446RE');
}

export function validateTestCatalog(catalog) {
  const errors = [];
  if (![1, 2].includes(catalog?.schemaVersion) || !Array.isArray(catalog.tests)) errors.push('Katalog sürümü veya test listesi geçersiz.');
  const devices = new Set();
  if (catalog?.schemaVersion === 2 && !Array.isArray(catalog.devices)) errors.push('Cihaz tanımları eksik.');
  for (const device of catalog?.devices || []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(device.id || '') || devices.has(device.id)) errors.push('Cihaz ID geçersiz veya tekrarlı.');
    devices.add(device.id);
    if (!device.name || !Array.isArray(device.matchParts) || !device.matchParts.length
      || !Array.isArray(device.protocols) || !device.protocols.length
      || device.protocols.some((value) => !PROTOCOLS.has(value))) errors.push(`${device.id}: cihaz eşlemesi geçersiz.`);
    if (!Array.isArray(device.requiredRoles) || device.requiredRoles.some((role) => !ROLES.has(role))
      || !Array.isArray(device.optionalRoles) || device.optionalRoles.some((role) => !ROLES.has(role))) errors.push(`${device.id}: pin rolleri geçersiz.`);
  }
  const seen = new Set();
  for (const item of catalog?.tests || []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id || '')) errors.push('Test ID yalnız küçük harf, sayı ve tire içermeli.');
    if (seen.has(item.id)) errors.push(`Tekrarlanan test ID: ${item.id}`);
    seen.add(item.id);
    if (!item.name || !Array.isArray(item.supportedMcu)) errors.push(`${item.id}: ad veya MCU listesi eksik.`);
    if (!['planned', 'ready'].includes(item.status)) errors.push(`${item.id}: durum planned veya ready olmalı.`);
    if (item.sourcePath && !/^(?:[a-z0-9_-]+\/)*stardrop-project\.json$|^templates\/[a-z0-9_-]+\.c$/.test(item.sourcePath)) errors.push(`${item.id}: güvenli proje manifesti veya şablon yolu gerekli.`);
    if (item.status === 'ready' && !item.sourcePath) errors.push(`${item.id}: hazır testin kaynak yolu olmalı.`);
    if (item.status === 'ready' && item.sourcePath?.endsWith('stardrop-project.json') && item.build !== 'stm32-hal-v1') errors.push(`${item.id}: desteklenen derleme türü eksik.`);
    if (catalog?.schemaVersion === 2 && !devices.has(item.deviceId)) errors.push(`${item.id}: tanımlı cihaz gerekli.`);
    if (catalog?.schemaVersion === 2 && (!Array.isArray(item.requiredRoles) || !item.requiredRoles.length
      || item.requiredRoles.some((role) => !ROLES.has(role)))) errors.push(`${item.id}: zorunlu pin rolleri geçersiz.`);
  }
  return { valid: errors.length === 0, errors };
}

export function testsForComponent(catalog, component, mcuPart, { readyOnly = false } = {}) {
  if (!component) return [];
  const part = String(component.part || '').toUpperCase();
  const family = canonicalMcu(mcuPart);
  const device = deviceForComponent(catalog, component);
  return (catalog?.tests || []).filter((item) => !['generic-i2c', 'generic-spi', 'mcu-selftest'].includes(item.id)
    && (!readyOnly || item.status === 'ready')
    && (item.supportedMcu?.includes(family) || item.supportedMcu?.some((name) => mcuPart?.startsWith(name)))
    && (item.deviceId ? item.deviceId === device?.id : item.matchParts?.some((pattern) => part.includes(pattern.toUpperCase())))
    && (!item.protocol || item.protocol === component.protocol || item.protocol.includes(component.protocol)));
}

export function testForComponent(catalog, component, mcuPart) {
  return testsForComponent(catalog, component, mcuPart, { readyOnly: true })[0] || null;
}
