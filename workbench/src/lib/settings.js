export const SETTINGS_KEY = 'stardrop.preferences.v1';
export const DEFAULT_SETTINGS = Object.freeze({ rememberRepo: false, intervalMs: 500, watchIntervalMs: 250, recordLimit: 2000,
  exportDirectory: '', temperatureUnit: 'C', pressureUnit: 'Pa', fontScale: 1, uiScale: 1,
  reducedMotion: false, startPage: 'workbench', trustedRepository: 'ayberkarslan/stardrop-code-repo', });
export function validateSettings(input = {}) {
  const result = { ...DEFAULT_SETTINGS };
  for (const key of ['rememberRepo', 'reducedMotion']) if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const [key, choices] of Object.entries({ intervalMs: [250, 500, 1000], watchIntervalMs: [225, 250, 500, 1000], recordLimit: [500, 1000, 2000],
    temperatureUnit: ['C', 'F'], pressureUnit: ['Pa', 'hPa', 'kPa'], fontScale: [1, 1.1, 1.2], uiScale: [0.9, 1, 1.1],
    startPage: ['workbench', 'flash', 'library', 'devices', 'monitor', 'empty'] })) {
    if (input[key] !== undefined && !choices.includes(input[key])) throw new Error(`Geçersiz ayar: ${key}`);
    if (input[key] !== undefined) result[key] = input[key];
  }
  for (const key of ['exportDirectory', 'trustedRepository']) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 500 || /[\x00-\x1f]/.test(input[key]))) throw new Error(`Geçersiz ayar: ${key}`);
    if (input[key] !== undefined) result[key] = input[key];
  }
  if (result.trustedRepository && !/^[\w][\w.-]*\/[\w][\w.-]*$/.test(result.trustedRepository)) throw new Error('Geçersiz güvenilir depo.');
  return result;
}
export function loadSettings() {
  try { return validateSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function redact(value) {
  if (typeof value === 'string') return value.replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+/g, '[gizlendi]')
    .replace(/([?&](?:code|state|token|access_token)=)[^&\s]+/gi, '$1[gizlendi]')
    .replace(/(Bearer\s+)[\w.-]+/gi, '$1[gizlendi]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/token|secret|password|api.?key|authorization|credential/i.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key))
    .map(([key, item]) => [key, redact(item)]));
  return value;
}
export function measurement(channel, preferences) {
  if (channel.unit === 'degC') return { ...channel, unit: preferences.temperatureUnit === 'F' ? '°F' : '°C', value: preferences.temperatureUnit === 'F' ? channel.value * 9 / 5 + 32 : channel.value };
  if (channel.unit === 'Pa') return { ...channel, unit: preferences.pressureUnit, value: channel.value / ({ Pa: 1, hPa: 100, kPa: 1000 }[preferences.pressureUnit] || 1) };
  return channel;
}
export function readiness({ compiler, sourceStatus, repositoryOk, esp, target }) {
  const rows = [
    { label: 'Kod hazırlama', ready: Boolean(compiler?.ready && sourceStatus?.activeSha), detail: !compiler?.ready ? 'Derleyici kontrolü gerekli' : !sourceStatus?.activeSha ? 'Test kaynağını indir' : sourceStatus.offline ? 'İndirilmiş kaynakla çevrimdışı hazır' : 'Derleyici ve kaynak hazır' },
    { label: 'Yükleme', ready: Boolean(esp?.status === 'online' && target?.connected), detail: esp?.status !== 'online' ? 'ESP32 bağlı değil' : !target?.connected ? 'STM32 bağlı değil' : 'ESP32 ve STM32 bağlı' },
    { label: 'Canlı izleme', ready: Boolean(esp?.status === 'online' && target?.connected && esp?.programmer?.telemetryAvailable), detail: !esp?.programmer?.telemetryAvailable ? 'Telemetri destekli ESP firmware’i gerekli' : 'Hedef firmware ABI’si izleme başlatılınca doğrulanır' },
    { label: 'GitHub paylaşımı', ready: Boolean(repositoryOk), detail: repositoryOk ? 'Depo erişilebilir; yayın için yazma izni de gerekli' : 'Depo erişimini kontrol et' },
  ];
  return rows;
}

export function makeBackup({ preferences, githubConfig, records, profiles }) {
  return redact({ format: 'stardrop-workshop', version: 1, createdAt: new Date().toISOString(),
    preferences: { ...validateSettings(preferences), rememberRepo: false, exportDirectory: '' },
    githubConfig: { repository: githubConfig.repository, ref: githubConfig.ref }, records,
    profiles: profiles.filter(Boolean).map(profile => ({ ...profile, targetUid: null,
      connections: profile.connections.map(connection => ({ ...connection, approved: false })) })) });
}
export function parseBackup(text) {
  if (text.length > 4 * 1024 * 1024) throw new Error('Yedek 4 MB sınırını aşıyor.');
  const data = JSON.parse(text);
  if (data?.format !== 'stardrop-workshop' || data.version !== 1 || !Array.isArray(data.profiles) || data.profiles.length > 100
    || !data.records || typeof data.records !== 'object' || Array.isArray(data.records)
    || Object.keys(data.records).length > 10000) throw new Error('Desteklenen atölye yedeği değil.');
  for (const [uid, record] of Object.entries(data.records)) {
    if (!/^[0-9a-f]{24}$/.test(uid) || /^(0{24}|f{24})$/.test(uid) || record.uid !== uid
      || typeof record.label !== 'string' || [...record.label].length > 32 || /[\x00-\x1f]/.test(record.label)
      || typeof record.model !== 'string' || record.model.length > 80 || /[\x00-\x1f]/.test(record.model)
      || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0) throw new Error('Yedekteki kart kaydı geçersiz.');
    const a = record.flashAnalysis;
    if (a && (!['totalBytes', 'programmedBytes', 'freeBytes', 'durationMs', 'analyzedAt'].every(key => Number.isSafeInteger(a[key]) && a[key] >= 0)
      || a.totalBytes <= 0 || a.totalBytes > 16 * 1024 * 1024 || a.programmedBytes + a.freeBytes !== a.totalBytes)) throw new Error('Yedekteki flash analizi geçersiz.');
    if (!record.label.trim() && !a) throw new Error('Kart kaydı boş.');
  }
  const repo = data.githubConfig;
  if (!repo || !/^[\w][\w.-]*\/[\w][\w.-]*$/.test(repo.repository) || !/^[\w.-]{1,100}$/.test(repo.ref)) throw new Error('Yedekte depo ayarı geçersiz.');
  const profiles = data.profiles.map(profile => {
    if (profile.schemaVersion !== 1 || typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 200
      || !profile.mcu || typeof profile.mcu.part !== 'string' || !Array.isArray(profile.components)
      || profile.components.length > 100 || !Array.isArray(profile.connections) || profile.connections.length > 1000
      || profile.components.some(c => typeof c.ref !== 'string' || typeof c.part !== 'string')
      || profile.connections.some(c => typeof c.componentRef !== 'string' || typeof c.role !== 'string' || typeof c.mcuPin !== 'string')) throw new Error('Yedekteki bağlantı profili geçersiz.');
    return { ...redact(profile), id: crypto.randomUUID(), targetUid: null,
      connections: profile.connections.map(c => ({ ...redact(c), approved: false })) };
  });
  return { ...data, profiles, records: redact(data.records), githubConfig: { repository: repo.repository, ref: repo.ref }, preferences: validateSettings(data.preferences) };
}
