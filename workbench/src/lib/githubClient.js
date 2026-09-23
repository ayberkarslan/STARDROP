const GITHUB_API = 'https://api.github.com';

export function parseRepository(repository) {
  const match = String(repository || '').trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) throw new Error('Repository owner/repo biçiminde olmalı.');
  return { owner: match[1], repo: match[2] };
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function beginGitHubDeviceLogin(clientId) {
  if (!clientId) throw new Error('GitHub App Client ID zorunludur.');
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId }),
  });
  if (!response.ok) throw new Error(`GitHub Device Login HTTP ${response.status}`);
  return response.json();
}

export async function pollGitHubDeviceLogin(clientId, deviceCode) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
  });
  const result = await response.json();
  if (result.access_token) return result.access_token;
  if (['authorization_pending', 'slow_down'].includes(result.error)) return null;
  throw new Error(result.error_description || result.error || 'GitHub giriş isteği reddedildi.');
}

export async function currentGitHubUser(token) {
  return api('/user', { token });
}

export async function dispatchProfileBuild({ token, repository, profile, testId, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  return api(`/repos/${owner}/${repo}/actions/workflows/build-profile.yml/dispatches`, {
    token, method: 'POST', body: { ref, inputs: { test_id: testId, profile_json: JSON.stringify(profile) } },
  });
}

export async function dispatchAuditEvent({ token, repository, event, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  return api(`/repos/${owner}/${repo}/actions/workflows/audit-event.yml/dispatches`, {
    token, method: 'POST', body: { ref, inputs: { event_json: JSON.stringify(event) } },
  });
}

export async function fetchPrivateCatalog({ token, repository, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  const response = await api(`/repos/${owner}/${repo}/contents/catalog/catalog.json?ref=${encodeURIComponent(ref)}`, { token });
  return JSON.parse(atob(response.content.replace(/\n/g, '')));
}
