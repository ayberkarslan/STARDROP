/**
 * Canonical, portable representation of a STARDROP board.
 *
 * This module deliberately has no React or Tauri dependency so that parser,
 * project package and cloud-build clients all use identical validation rules.
 */
import { targetPackage } from './targetPins.js';

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
    targetUid: null,
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

export function createManualI2cProfile({ name, mcuPart, componentRef, componentPart, scl, sda }) {
  const cleanName = String(name || '').trim();
  const part = String(mcuPart || '').trim().toUpperCase();
  const ref = String(componentRef || '').trim().toUpperCase();
  const sensor = String(componentPart || '').trim().toUpperCase();
  if (!cleanName || !/^STM32F401C[CDE]/.test(part) && !part.startsWith('STM32F446RE')) throw new Error('Kart adı ve desteklenen STM32 modeli gerekli.');
  if (!/^[A-Z]+\d+$/.test(ref) || !sensor) throw new Error('Sensör adı ve U2 gibi bir bileşen referansı gerekli.');
  const profile = newBoardProfile({ name: cleanName, mcuPart: part });
  profile.components = [{ ref, part: sensor, category: 'SENSOR', protocol: 'I2C', peripheral: 'SOFT_I2C_1' }];
  profile.connections = [['SCL', scl], ['SDA', sda]].map(([role, pin]) => ({
    componentRef: ref, componentPart: sensor, role, sensorPin: role, mcuPin: normalizePin(pin),
    peripheral: 'SOFT_I2C_1', approved: false, source: 'USER', path: [], evidence: {}, confidence: 0,
  }));
  const validation = validateBoardProfile(profile);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return profile;
}

export function createManualLedProfile({ name, mcuPart, pin, activeLow = true, blinkMs = 100 }) {
  const part = String(mcuPart || '').trim().toUpperCase();
  const gpio = normalizePin(pin);
  if (!String(name || '').trim() || !/^STM32F401C[CDE]/.test(part) && !part.startsWith('STM32F446RE')) throw new Error('Kart adı ve desteklenen STM32 modeli gerekli.');
  const capability = supportedPeripheral(part, 'GPIO', 'LED', gpio);
  if (capability.supported !== true) throw new Error(capability.reason || 'LED GPIO geçersiz.');
  const interval = Number(blinkMs);
  if (!Number.isInteger(interval) || interval < 50 || interval > 5000) throw new Error('LED aralığı 50–5000 ms olmalı.');
  const profile = newBoardProfile({ name: String(name).trim(), mcuPart: part });
  profile.components = [{ ref: 'D1', part: 'LED', category: 'OUTPUT', protocol: 'GPIO', peripheral: 'GPIO', activeLow: Boolean(activeLow), blinkMs: interval }];
  profile.connections = [{ componentRef: 'D1', componentPart: 'LED', role: 'LED', sensorPin: 'LED', mcuPin: gpio,
    peripheral: 'GPIO', approved: false, source: 'USER', path: [], evidence: {}, confidence: 0 }];
  return profile;
}

export function addManualPeripheral(profile, { part, protocol, ref, pins, activeLow = true, blinkMs = 100 }) {
  if (!profile || !['GPIO', 'I2C', 'SPI'].includes(protocol)) throw new Error('Önce kartı ve bağlantı türünü seç.');
  const componentPart = String(part || '').trim().toUpperCase();
  const componentRef = String(ref || '').trim().toUpperCase();
  if (!componentPart || !/^[A-Z]+\d+$/.test(componentRef) || profile.components.some((item) => item.ref === componentRef)) {
    throw new Error('Bileşen adı veya U2 gibi benzersiz referans geçersiz.');
  }
  if (protocol === 'GPIO' && componentPart !== 'LED') throw new Error('GPIO akışında şu an yalnız LED destekleniyor.');
  const roles = protocol === 'GPIO' ? ['LED'] : protocol === 'I2C' ? ['SCL', 'SDA'] : ['SCK', 'MISO', 'MOSI', 'CS'];
  const peripheral = protocol === 'GPIO' ? 'GPIO' : protocol === 'I2C' ? 'SOFT_I2C_1' : 'SPI1';
  const connections = roles.map((role) => ({
    componentRef, componentPart, role, sensorPin: role, mcuPin: normalizePin(pins?.[role]),
    peripheral, approved: false, source: 'USER', path: [], evidence: {}, confidence: 0,
  }));
  const component = { ref: componentRef, part: componentPart, category: protocol === 'GPIO' ? 'OUTPUT' : 'SENSOR', protocol, peripheral,
    ...(protocol === 'GPIO' ? { activeLow: Boolean(activeLow), blinkMs: Number(blinkMs) } : {}) };
  const next = { ...profile, components: [...profile.components, component], connections: [...profile.connections, ...connections] };
  return addAuditEvent(next, 'MANUAL_COMPONENT_ADDED', { componentRef, protocol });
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
  const target = targetPackage(mcuPart);
  if (!target) return { supported: null, reason: `${mcuPart} için doğrulanmış paket pin verisi yok.` };
  if (!target.pins.some((item) => item.name === normalized)) {
    return { supported: false, reason: `${normalized || pin || 'Boş pin'} ${mcuPart} paketinde bulunmuyor.` };
  }
  if ((peripheral === 'GPIO' && role === 'LED') || (/^SPI[1-3]$/.test(peripheral || '') && ['CS', 'INT', 'RESET'].includes(role))) {
    const match = normalized?.match(/^P([ABC])(\d{1,2})$/);
    const port = match?.[1];
    const index = match ? Number(match[2]) : -1;
    const supported = Boolean(['STM32F401', 'STM32F446'].includes(family) && index <= 15
      && !(port === 'A' && (index === 13 || index === 14))
      && (port !== 'C' || family === 'STM32F446' || index >= 13));
    return { supported, reason: supported ? null : `${normalized || pin || 'Boş pin'} ${mcuPart} üzerinde ${role} için uygun değil.` };
  }
  if (/^SOFT_I2C(?:_[1-9]\d*)?$/.test(peripheral || '') && ['SCL', 'SDA'].includes(role)) {
    const match = normalized?.match(/^P([A-C])(\d{1,2})$/);
    const port = match?.[1];
    const index = match ? Number(match[2]) : -1;
    const supported = Boolean(match && index <= 15 && !(port === 'A' && (index === 13 || index === 14))
      && (family === 'STM32F446' || (family === 'STM32F401' && (port !== 'C' || index >= 13))));
    return { supported, reason: supported ? null : `${normalized || pin || 'Boş pin'} ${mcuPart} yazılımsal I²C için uygun değil.` };
  }
  const permitted = CAPABILITIES[family]?.[peripheral]?.[role];
  if (!permitted) return { supported: null, reason: 'Bu peripheral/rol için yerel yetenek verisi yok.' };
  if (family === 'STM32F401' && /^PC(?:[0-9]|1[0-2])$/.test(normalized || '')) {
    return { supported: false, reason: `${normalized} ${mcuPart} paketinde bulunmuyor.` };
  }
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
  const component = profile?.components?.find((item) => item.ref === componentRef);
  const requiredRoles = component?.protocol === 'I2C' ? ['SCL', 'SDA'] : component?.protocol === 'SPI' ? ['SCK', 'MISO', 'MOSI', 'CS'] : [];
  const connections = profile?.connections?.filter((item) => item.componentRef === componentRef && (!requiredRoles.length || requiredRoles.includes(item.role))) || [];
  const selected = profile ? { ...profile, components: component ? [component] : [], connections } : null;
  const base = validateBoardProfile(selected);
  const errors = [...base.errors];
  if (!component) errors.push('Test edilecek bileşen profilde bulunamadı.');
  if (!connections.length) errors.push('Bu bileşen için MCU pin bağlantısı bulunamadı.');
  for (const role of requiredRoles) {
    const count = connections.filter((item) => item.role === role).length;
    if (count !== 1) errors.push(`${componentRef} için tam bir ${role} bağlantısı gerekli (${count} bulundu).`);
  }
  if (component?.protocol === 'I2C' && connections.length === 2 && connections[0].peripheral !== connections[1].peripheral) errors.push('SCL ve SDA aynı I2C bus üzerinde olmalı.');
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
