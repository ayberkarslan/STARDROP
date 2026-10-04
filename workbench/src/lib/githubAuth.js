import { deleteSecret, loadSecret, saveSecret } from './secretStore.js';

let refreshInFlight = null;

export async function saveGitHubSession(result) {
  if (!result?.access_token) throw new Error('GitHub erişim token’ı alınamadı.');
  const modes = [await saveSecret('github_access_token', result.access_token)];
  if (result.refresh_token) modes.push(await saveSecret('github_refresh_token', result.refresh_token));
  if (result.expires_in) modes.push(await saveSecret('github_access_expires_at', String(Date.now() + result.expires_in * 1000)));
  if (result.auth_method) modes.push(await saveSecret('github_auth_method', result.auth_method));
  result.storage_mode = modes.includes('memory') ? 'memory' : 'os';
  return result.access_token;
}

export async function clearGitHubSession() {
  if (refreshInFlight) await refreshInFlight.catch(() => {});
  await Promise.all([
    deleteSecret('github_access_token'),
    deleteSecret('github_refresh_token'),
    deleteSecret('github_access_expires_at'),
    deleteSecret('github_auth_method'),
  ]);
}

export async function validGitHubToken() {
  const token = await loadSecret('github_access_token');
  if (!token) return null;
  const expiresAt = Number(await loadSecret('github_access_expires_at'));
  if (!expiresAt || Date.now() < expiresAt - 120000) return token;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await loadSecret('github_refresh_token');
    if (!refreshToken) throw new Error('GitHub oturumu süresi doldu; yeniden giriş yap.');
    if (!window.__TAURI_INTERNALS__) throw new Error('GitHub oturum yenileme masaüstü uygulamasında kullanılabilir.');
    const { invoke } = await import('@tauri-apps/api/core');
    const authMethod = await loadSecret('github_auth_method');
    const result = JSON.parse(await invoke(authMethod === 'device' ? 'github_device_refresh' : 'github_refresh_login', { refreshToken }));
    result.auth_method = authMethod || 'browser';
    return saveGitHubSession(result);
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}
