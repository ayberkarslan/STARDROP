import assert from 'node:assert/strict';
import test from 'node:test';
import { clearGitHubSession, saveGitHubSession, validGitHubToken } from './githubAuth.js';
import { loadSecret } from './secretStore.js';

test('logout removes both access and refresh credentials', async () => {
  const session = { access_token: 'access-test', refresh_token: 'refresh-test', expires_in: 3600, auth_method: 'device' };
  await saveGitHubSession(session);
  assert.equal(session.storage_mode, 'memory');
  assert.equal(await validGitHubToken(), 'access-test');
  assert.equal(await loadSecret('github_auth_method'), 'device');
  await clearGitHubSession();
  assert.equal(await validGitHubToken(), null);
  assert.equal(await loadSecret('github_refresh_token'), null);
  assert.equal(await loadSecret('github_access_expires_at'), null);
  assert.equal(await loadSecret('github_auth_method'), null);
});
