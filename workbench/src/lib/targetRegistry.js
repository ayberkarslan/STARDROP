const PREVIEW_KEY = 'stardrop.targets.v1';

export function targetUid(value) {
  const uid = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{24}$/.test(uid) && !/^(0{24}|f{24})$/.test(uid) ? uid : null;
}

export function namedTarget(target, records) {
  const record = target?.connected && records[targetUid(target.uid)];
  return record ? { ...target, label: record.label || target.label, flashAnalysis: record.flashAnalysis, recordUpdatedAt: record.updatedAt } : target;
}

export function validateFlashAnalysis(value) {
  if (!value || !['totalBytes', 'programmedBytes', 'freeBytes', 'durationMs'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) ||
    !value.totalBytes || value.totalBytes > 16 * 1024 * 1024 || value.programmedBytes + value.freeBytes !== value.totalBytes) throw new Error('Flash analiz verisi geçersiz.');
  return Object.fromEntries(['totalBytes', 'programmedBytes', 'freeBytes', 'durationMs'].map(key => [key, value[key]]));
}

export function createTargetRegistry({ load, save, saveAnalysis, onChange }) {
  const ready = Promise.resolve().then(load).then(records => { onChange(records || {}); });
  let pending = ready;
  return {
    ready,
    saveAnalysis(uid, model, analysis) {
      const write = async () => {
        await ready;
        const normalized = targetUid(uid);
        if (!normalized) throw new Error('Geçerli STM32 UID’si gerekli.');
        const records = await saveAnalysis({ uid: normalized, model, analysis: validateFlashAnalysis(analysis) });
        if (!records?.[normalized]?.flashAnalysis?.analyzedAt) throw new Error('Yerel flash kaydı doğrulanamadı.');
        onChange(records); return records[normalized].flashAnalysis;
      };
      pending = pending.then(write, write);
      return pending;
    },
    save(uid, label, model = '', overwrite = true) {
      const normalized = targetUid(uid);
      const name = String(label || '').trim();
      if (!normalized || !name || [...name].length > 32 || /[\u0000-\u001f\u007f]/.test(name)) return Promise.reject(new Error('Geçerli UID ve 1–32 karakterlik kart adı gerekli.'));
      const write = async () => {
        await ready;
        const records = await save({ uid: normalized, label: name, model, overwrite });
        if (!records?.[normalized]?.label) throw new Error('Yerel kart kaydı doğrulanamadı.');
        onChange(records); return records[normalized];
      };
      pending = pending.then(write, write);
      return pending;
    },
  };
}

export function targetRegistryStorage() {
  if (window.__TAURI_INTERNALS__) {
    const command = async (name, args) => (await import('@tauri-apps/api/core')).invoke(name, args);
    return { load: () => command('target_registry_load'), save: args => command('target_registry_save', args), saveAnalysis: args => command('target_registry_analysis_save', args) };
  }
  const load = () => {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.targets || typeof data.targets !== 'object') throw new Error('Kart kayıt dosyası geçersiz.');
    return data.targets;
  };
  return { load, save: ({ uid, label, model, overwrite }) => {
    const targets = load();
    if (overwrite || !targets[uid]?.label) targets[uid] = { ...targets[uid], uid, label, model, createdAt: targets[uid]?.createdAt || Date.now(), updatedAt: Date.now() };
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ version: 1, targets }));
    return targets;
  }, saveAnalysis: ({ uid, model, analysis }) => {
    const targets = load(); const now = Date.now();
    targets[uid] = { uid, label: '', model, createdAt: now, ...targets[uid], updatedAt: now,
      flashAnalysis: { ...validateFlashAnalysis(analysis), analyzedAt: now } };
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ version: 1, targets }));
    return targets;
  } };
}
