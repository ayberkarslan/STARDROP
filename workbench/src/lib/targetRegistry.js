const PREVIEW_KEY = 'stardrop.targets.v1';

export function targetUid(value) {
  const uid = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{24}$/.test(uid) && !/^(0{24}|f{24})$/.test(uid) ? uid : null;
}

export function namedTarget(target, records) {
  const record = target?.connected && records[targetUid(target.uid)];
  return record ? { ...target, label: record.label } : target;
}

export function createTargetRegistry({ load, save, onChange }) {
  const ready = Promise.resolve().then(load).then(records => { onChange(records || {}); });
  let pending = ready;
  return {
    ready,
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
    return { load: () => command('target_registry_load'), save: args => command('target_registry_save', args) };
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
    if (overwrite || !targets[uid]) targets[uid] = { uid, label, model, createdAt: targets[uid]?.createdAt || Date.now(), updatedAt: Date.now() };
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ version: 1, targets }));
    return targets;
  } };
}
