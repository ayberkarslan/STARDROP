let volatileSecrets = new Map();

async function tauriInvoke(command, args) {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

/** Credentials never enter project archives or localStorage. */
export async function saveSecret(key, value) {
  const saved = await tauriInvoke('save_secret', { key, value });
  if (saved === undefined) { volatileSecrets.set(key, value); return 'memory'; }
  return saved;
}

export async function loadSecret(key) {
  const value = await tauriInvoke('load_secret', { key });
  return value === undefined ? (volatileSecrets.get(key) || null) : value;
}

export async function deleteSecret(key) {
  const deleted = await tauriInvoke('delete_secret', { key });
  if (deleted === undefined) volatileSecrets.delete(key);
}

export async function saveRepoSecret(value, remember) {
  const mode = await tauriInvoke('save_repo_secret', { value, remember });
  if (mode !== undefined) return mode;
  volatileSecrets.set('github_repo_token', value);
  return 'memory';
}
