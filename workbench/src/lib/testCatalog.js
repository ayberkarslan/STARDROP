import seedCatalog from '../../../diagnostics/catalog/catalog.json' with { type: 'json' };
import { canonicalMcu } from './boardProfile.js';

export const DEFAULT_TEST_CATALOG = seedCatalog;

export function buildableTargetPart(part) {
  const normalized = String(part || '').toUpperCase();
  return /^STM32F401C[CDE]/.test(normalized) || normalized.startsWith('STM32F446RE');
}

export function validateTestCatalog(catalog) {
  const errors = [];
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.tests)) errors.push('Katalog sürümü veya test listesi geçersiz.');
  const seen = new Set();
  for (const item of catalog?.tests || []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id || '')) errors.push('Test ID yalnız küçük harf, sayı ve tire içermeli.');
    if (seen.has(item.id)) errors.push(`Tekrarlanan test ID: ${item.id}`);
    seen.add(item.id);
    if (!item.name || !Array.isArray(item.supportedMcu)) errors.push(`${item.id}: ad veya MCU listesi eksik.`);
    if (!['planned', 'ready'].includes(item.status)) errors.push(`${item.id}: durum planned veya ready olmalı.`);
    if (item.sourcePath && !/^templates\/[a-z0-9_-]+\.c$/.test(item.sourcePath)) errors.push(`${item.id}: kaynak yolu templates/ altında tek bir .c dosyası olmalı.`);
    if (item.status === 'ready' && !item.sourcePath) errors.push(`${item.id}: hazır testin kaynak yolu olmalı.`);
  }
  return { valid: errors.length === 0, errors };
}

export function testForComponent(catalog, component, mcuPart) {
  if (!component) return null;
  const part = String(component.part || '').toUpperCase();
  const family = canonicalMcu(mcuPart);
  return catalog?.tests?.find((item) => !['generic-i2c', 'generic-spi', 'mcu-selftest'].includes(item.id)
    && item.supportedMcu?.includes(family)
    && item.matchParts?.some((pattern) => part.includes(pattern.toUpperCase()))
    && (!item.protocol || item.protocol === component.protocol || item.protocol.includes(component.protocol))) || null;
}
