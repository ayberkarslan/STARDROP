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
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const error = new Error(`GitHub API HTTP ${response.status}: ${failure.message || 'İstek reddedildi.'}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function currentGitHubUser(token) {
  return api('/user', { token });
}

export async function dispatchAuditEvent({ token, repository, event, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  return api(`/repos/${owner}/${repo}/actions/workflows/audit-event.yml/dispatches`, {
    token, method: 'POST', body: { ref, inputs: { event_json: JSON.stringify(event) } },
  });
}

export async function fetchPrivateCatalog({ token, repository, ref = 'main' }) {
  return (await fetchCatalogDocument({ token, repository, ref })).catalog;
}

async function contentRoot({ token, owner, repo, ref }) {
  try {
    await api(`/repos/${owner}/${repo}/contents/stardrop?ref=${encodeURIComponent(ref)}`, { token });
    return 'stardrop/';
  } catch (error) {
    if (error.status !== 404) throw error;
    return ''; // Existing repositories remain readable during migration.
  }
}

export async function fetchCatalogDocument({ token, repository, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  const root = await contentRoot({ token, owner, repo, ref });
  const response = await api(`/repos/${owner}/${repo}/contents/${root}catalog/catalog.json?ref=${encodeURIComponent(ref)}`, { token });
  const bytes = Uint8Array.from(atob(response.content.replace(/\n/g, '')), (character) => character.charCodeAt(0));
  return { catalog: JSON.parse(new TextDecoder().decode(bytes)), sha: response.sha };
}

export async function catalogWritePermission({ token, repository }) {
  const { owner, repo } = parseRepository(repository);
  const details = await api(`/repos/${owner}/${repo}`, { token });
  return Boolean(details.permissions?.push || details.permissions?.admin);
}

export async function saveCatalogDocument({ token, repository, ref = 'main', catalog, sha }) {
  const { owner, repo } = parseRepository(repository);
  const root = await contentRoot({ token, owner, repo, ref });
  const bytes = new TextEncoder().encode(`${JSON.stringify(catalog, null, 2)}\n`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return api(`/repos/${owner}/${repo}/contents/${root}catalog/catalog.json`, {
    token, method: 'PUT', body: { message: 'Update sensor diagnostic mappings', content: btoa(binary), sha, branch: ref },
  });
}

function encodeContent(value) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeContent(response) {
  if (response.encoding !== 'base64' || typeof response.content !== 'string') throw new Error('GitHub dosya içeriği okunamadı.');
  const bytes = Uint8Array.from(atob(response.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function listLibraryEntries({ token, repository, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  const root = await contentRoot({ token, owner, repo, ref });
  let files;
  try {
    files = await api(`/repos/${owner}/${repo}/contents/${root}library?ref=${encodeURIComponent(ref)}`, { token });
  } catch (error) {
    if (error.status === 404) {
      await assertRepositoryBranch({ token, owner, repo, ref });
      return [];
    }
    throw error;
  }
  if (!Array.isArray(files)) throw new Error('GitHub kütüphane dizini okunamadı.');
  if (files.length >= 1000) throw new Error('Kütüphane 1000 kayıt sınırına ulaştı; sayfalama eklenmeli.');
  const records = await Promise.all(files.filter((file) => file.type === 'file' && /^[0-9a-f-]{36}\.json$/i.test(file.name))
    .map(async (file) => decodeContent(await api(`/repos/${owner}/${repo}/contents/${file.path}?ref=${encodeURIComponent(ref)}`, { token }))));
  return records;
}

export async function publishLibraryEntry({ token, repository, ref = 'main', entry }) {
  const { owner, repo } = parseRepository(repository);
  if (!/^[0-9a-f-]{36}$/i.test(entry?.id || '')) throw new Error('Kütüphane kayıt kimliği geçersiz.');
  const root = await contentRoot({ token, owner, repo, ref });
  try {
    return await api(`/repos/${owner}/${repo}/contents/${root}library/${entry.id}.json`, {
      token, method: 'PUT', body: { message: `Add test setup: ${entry.name.slice(0, 70)}`, content: encodeContent(entry), branch: ref },
    });
  } catch (error) {
    if (error.status !== 404) throw error;
    await assertRepositoryBranch({ token, owner, repo, ref });
    throw new Error(`Depo ve ${ref} dalı erişilebilir fakat GitHub bu dosya yazma isteğini reddetti. Bu hesap ve kullanılan token için Contents: Read and write yetkisini, GitHub App kullanılıyorsa uygulamanın depoya kurulu olduğunu kontrol et.`);
  }
}

async function assertRepositoryBranch({ token, owner, repo, ref }) {
  try {
    await api(`/repos/${owner}/${repo}`, { token });
  } catch (error) {
    if (error.status === 404) throw new Error(`${owner}/${repo} deposu bu kimlikle görünmüyor. Depo adını, token erişimini ve GitHub App kurulumunu kontrol et.`);
    throw error;
  }
  try {
    await api(`/repos/${owner}/${repo}/branches/${encodeURIComponent(ref)}`, { token });
  } catch (error) {
    if (error.status === 404) throw new Error(`${owner}/${repo} deposunda ${ref} dalı bulunamadı. Ayarlar'daki dal adını kontrol et.`);
    throw error;
  }
}
