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
    throw new Error(`GitHub API HTTP ${response.status}: ${failure.message || 'İstek reddedildi.'}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function currentGitHubUser(token) {
  return api('/user', { token });
}

export async function dispatchProfileBuild({ token, repository, profile, testId, componentRef, requestId, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  return api(`/repos/${owner}/${repo}/actions/workflows/build-profile.yml/dispatches`, {
    token, method: 'POST', body: { ref, inputs: { test_id: testId, component_ref: componentRef, request_id: requestId, profile_json: JSON.stringify(profile) } },
  });
}

export async function waitForProfileArtifact({ token, repository, requestId, testId, ref = 'main', actor, startedAt = Date.now(), onStatus }) {
  const { owner, repo } = parseRepository(repository);
  const title = `stardrop-${requestId}-${testId}`;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const listing = await api(`/repos/${owner}/${repo}/actions/workflows/build-profile.yml/runs?event=workflow_dispatch&per_page=50&branch=${encodeURIComponent(ref)}`, { token });
    const run = listing.workflow_runs?.find((item) => item.display_title === title && item.actor?.login === actor && Date.parse(item.created_at) >= startedAt - 30000);
    if (run) {
      onStatus?.(run.status === 'completed' ? `Derleme tamamlandı: ${run.conclusion}` : `GitHub Actions: ${run.status}`);
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error(`Derleme başarısız (${run.conclusion}). ${run.html_url}`);
        const artifacts = await api(`/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts`, { token });
        const artifact = artifacts.artifacts?.find((item) => item.name === `stardrop-firmware-${requestId}` && !item.expired);
        if (!artifact) throw new Error('Başarılı derlemede firmware artefaktı bulunamadı.');
        return { run, artifact };
      }
    } else onStatus?.('GitHub işinin kuyruğa alınması bekleniyor…');
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error('GitHub derleme süresi aşıldı (8 dakika).');
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

export async function fetchCatalogDocument({ token, repository, ref = 'main' }) {
  const { owner, repo } = parseRepository(repository);
  const response = await api(`/repos/${owner}/${repo}/contents/catalog/catalog.json?ref=${encodeURIComponent(ref)}`, { token });
  const bytes = Uint8Array.from(atob(response.content.replace(/\n/g, '')), (character) => character.charCodeAt(0));
  return { catalog: JSON.parse(new TextDecoder().decode(bytes)), sha: response.sha };
}

export async function catalogWritePermission({ token, repository }) {
  const { owner, repo } = parseRepository(repository);
  const details = await api(`/repos/${owner}/${repo}`, { token });
  return Boolean(details.permissions?.admin);
}

export async function saveCatalogDocument({ token, repository, ref = 'main', catalog, sha }) {
  const { owner, repo } = parseRepository(repository);
  const bytes = new TextEncoder().encode(`${JSON.stringify(catalog, null, 2)}\n`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return api(`/repos/${owner}/${repo}/contents/catalog/catalog.json`, {
    token, method: 'PUT', body: { message: 'Update sensor diagnostic mappings', content: btoa(binary), sha, branch: ref },
  });
}
