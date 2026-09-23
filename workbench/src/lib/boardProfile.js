/**
 * Canonical, portable representation of a STARDROP board.
 *
 * This module deliberately has no React or Tauri dependency so that parser,
 * project package and cloud-build clients all use identical validation rules.
 */
export const PROFILE_SCHEMA_VERSION = 1;

const CAPABILITIES = {
  STM32F401: {
    I2C1: { SCL: ['PB6', 'PB8'], SDA: ['PB7', 'PB9'] },
    I2C2: { SCL: ['PB10'], SDA: ['PB11'] },
    I2C3: { SCL: ['PA8'], SDA: ['PC9'] },
    SPI1: { SCK: ['PA5', 'PB3'], MISO: ['PA6', 'PB4'], MOSI: ['PA7', 'PB5'] },
    SPI2: { SCK: ['PB13'], MISO: ['PB14'], MOSI: ['PB15'] },
    SPI3: { SCK: ['PB3', 'PC10'], MISO: ['PB4', 'PC11'], MOSI: ['PB5', 'PC12'] },
  },
  STM32F446: {
    I2C1: { SCL: ['PB6', 'PB8'], SDA: ['PB7', 'PB9'] },
    I2C2: { SCL: ['PB10', 'PF1'], SDA: ['PB11', 'PF0'] },
    I2C3: { SCL: ['PA8'], SDA: ['PC9'] },
    SPI1: { SCK: ['PA5', 'PB3'], MISO: ['PA6', 'PB4'], MOSI: ['PA7', 'PB5'] },
    SPI2: { SCK: ['PB13'], MISO: ['PB14'], MOSI: ['PB15'] },
    SPI3: { SCK: ['PB3', 'PC10'], MISO: ['PB4', 'PC11'], MOSI: ['PB5', 'PC12'] },
  },
};

function now() {
  return new Date().toISOString();
}

export function canonicalMcu(part = '') {
  const normalized = String(part).toUpperCase();
  if (normalized.includes('STM32F401')) return 'STM32F401';
  if (normalized.includes('STM32F446')) return 'STM32F446';
  return normalized || 'UNKNOWN';
}

export function normalizePin(pin) {
  const match = String(pin || '').trim().toUpperCase().match(/^P([A-K])(\d{1,2})$/);
  return match ? `P${match[1]}${Number(match[2])}` : null;
}

export function newBoardProfile({ name = 'İsimsiz Kart', mcuPart = 'UNKNOWN', source = {} } = {}) {
  const createdAt = now();
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    createdAt,
    updatedAt: createdAt,
    source: {
      netlistName: source.netlistName || null,
      netlistSha256: source.netlistSha256 || null,
      schematicName: source.schematicName || null,
      schematicSha256: source.schematicSha256 || null,
    },
    mcu: {
      part: mcuPart,
      family: canonicalMcu(mcuPart),
      package: null,
      confidence: 0,
      source: 'USER',
    },
    components: [],
    connections: [],
    reviews: [],
    audit: [],
  };
}

export function confidenceForConnection(connection) {
  const evidence = connection.evidence || {};
  let score = 0;
  if (evidence.directTrace) score += 45;
  if (evidence.namedNet) score += 15;
  if (evidence.knownPartPin) score += 15;
  if (evidence.validAlternateFunction) score += 20;
  if (evidence.schematicConfirmed) score += 10;
  if (evidence.solderBridge) score -= 30;
  if (connection.source === 'USER') score = Math.max(score, 100);
  return Math.max(0, Math.min(100, score));
}

export function confidenceLevel(score) {
  if (score >= 85) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  return 'LOW';
}

export function supportedPeripheral(mcuPart, peripheral, role, pin) {
  const family = canonicalMcu(mcuPart);
  const normalized = normalizePin(pin);
  const permitted = CAPABILITIES[family]?.[peripheral]?.[role];
  if (!permitted) return { supported: null, reason: 'Bu peripheral/rol için yerel yetenek verisi yok.' };
  return {
    supported: Boolean(normalized && permitted.includes(normalized)),
    reason: normalized && permitted.includes(normalized)
      ? null
      : `${normalized || pin || 'Boş pin'} ${family} üzerinde ${peripheral}/${role} için geçerli değil.`,
  };
}

export function validateBoardProfile(profile) {
  const errors = [];
  const warnings = [];
  if (!profile || profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return { valid: false, errors: ['Desteklenmeyen BoardProfile sürümü.'], warnings };
  }
  if (!profile.name?.trim()) errors.push('Kart adı zorunludur.');
  if (canonicalMcu(profile.mcu?.part) === 'UNKNOWN') errors.push('MCU modeli seçilmelidir.');

  const occupiedPins = new Map();
  for (const connection of profile.connections || []) {
    const pin = normalizePin(connection.mcuPin);
    const label = `${connection.componentRef || 'Bilinmeyen'}:${connection.role || 'IO'}`;
    if (!pin) {
      errors.push(`${label} için geçerli bir MCU pini girilmedi.`);
      continue;
    }
    const prior = occupiedPins.get(pin);
    const sharedBus = prior && ['SCL', 'SDA', 'SCK', 'MISO', 'MOSI'].includes(connection.role)
      && prior.role === connection.role && prior.peripheral === connection.peripheral;
    if (prior && !sharedBus) errors.push(`${pin}, ${prior.label} ve ${label} tarafından birlikte kullanılıyor.`);
    occupiedPins.set(pin, { label, role: connection.role, peripheral: connection.peripheral });

    if (!connection.approved) warnings.push(`${label} henüz onaylanmadı.`);
    const capability = supportedPeripheral(profile.mcu.part, connection.peripheral, connection.role, pin);
    if (capability.supported === false) errors.push(capability.reason);
    if (capability.supported === null) warnings.push(`${label}: ${capability.reason}`);
    if (confidenceForConnection(connection) < 60 && !connection.approved) {
      warnings.push(`${label} düşük güven seviyesinde.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateTestTarget(profile, componentRef) {
  const base = validateBoardProfile(profile);
  const errors = [...base.errors];
  const component = profile?.components?.find((item) => item.ref === componentRef);
  const connections = profile?.connections?.filter((item) => item.componentRef === componentRef) || [];
  if (!component) errors.push('Test edilecek bileşen profilde bulunamadı.');
  if (!connections.length) errors.push('Bu bileşen için MCU pin bağlantısı bulunamadı.');
  for (const connection of connections) {
    if (!connection.approved) errors.push(`${componentRef}:${connection.role} bağlantısı henüz onaylanmadı.`);
    const capability = supportedPeripheral(profile.mcu.part, connection.peripheral, connection.role, connection.mcuPin);
    if (capability.supported === null) errors.push(`${componentRef}:${connection.role} için pin yeteneği doğrulanamadı.`);
  }
  return { valid: errors.length === 0, errors, warnings: base.warnings };
}

export function addAuditEvent(profile, type, details = {}, actor = 'local') {
  const event = { id: crypto.randomUUID(), at: now(), actor, type, details };
  return { ...profile, updatedAt: event.at, audit: [...(profile.audit || []), event] };
}

export function overallConfidence(profile) {
  const connections = profile.connections || [];
  if (!connections.length) return 0;
  return Math.round(connections.reduce((sum, item) => sum + confidenceForConnection(item), 0) / connections.length);
}

export const STM32_CAPABILITIES = CAPABILITIES;
