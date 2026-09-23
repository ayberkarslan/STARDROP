let volatileSecrets = new Map();

async function tauriInvoke(command, args) {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

/** Credentials never enter project archives or localStorage. */
export async function saveSecret(key, value) {
  const saved = await tauriInvoke('save_secret', { key, value });
  if (saved === undefined) volatileSecrets.set(key, value);
}

export async function loadSecret(key) {
  const value = await tauriInvoke('load_secret', { key });
  return value === undefined ? (volatileSecrets.get(key) || null) : value;
}

export async function deleteSecret(key) {
  const deleted = await tauriInvoke('delete_secret', { key });
  if (deleted === undefined) volatileSecrets.delete(key);
}
