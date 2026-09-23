import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchProfileBuild, parseRepository, waitForProfileArtifact } from './githubClient.js';

test('diagnostics repository parser accepts owner/repo only', () => {
  assert.deepEqual(parseRepository('YRT/stardrop-diagnostics'), { owner: 'YRT', repo: 'stardrop-diagnostics' });
  assert.throws(() => parseRepository('https://github.com/YRT/repo'));
});

test('build dispatch includes selected component and run correlation id', async () => {
  const oldFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => { request = { url, ...options }; return { ok: true, status: 204 }; };
  try {
    await dispatchProfileBuild({ token: 'test-token', repository: 'YRT/diagnostics', profile: { id: 'board' }, testId: 'bmp180', componentRef: 'U1', requestId: 'run-1' });
    const payload = JSON.parse(request.body);
    assert.equal(payload.inputs.component_ref, 'U1');
    assert.equal(payload.inputs.request_id, 'run-1');
  } finally { globalThis.fetch = oldFetch; }
});

test('artifact polling selects only the matching actor and request', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => url.includes('/artifacts')
    ? { artifacts: [{ id: 42, name: 'stardrop-firmware-run-1', expired: false }] }
    : { workflow_runs: [{ id: 7, display_title: 'stardrop-run-1-bmp180', actor: { login: 'operator' }, created_at: new Date().toISOString(), status: 'completed', conclusion: 'success' }] } });
  try {
    const result = await waitForProfileArtifact({ token: 'test-token', repository: 'YRT/diagnostics', requestId: 'run-1', testId: 'bmp180', actor: 'operator' });
    assert.equal(result.artifact.id, 42);
  } finally { globalThis.fetch = oldFetch; }
});
