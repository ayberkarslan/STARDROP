import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.js';

const origin = 'https://stardrop-auth.ayberkarslann0.workers.dev';
const state = '48291.0123456789abcdef0123456789abcdef';
const env = { GITHUB_CLIENT_ID: 'Iv123', GITHUB_CLIENT_SECRET: 'hidden' };

test('start redirects to GitHub with the registered callback and state', async () => {
  const response = await worker.fetch(new Request(`${origin}/start?state=${state}`), env);
  const url = new URL(response.headers.get('Location'));
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.searchParams.get('client_id'), env.GITHUB_CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), `${origin}/callback`);
  assert.equal(url.searchParams.get('state'), state);
});

test('callback can redirect only to the requested localhost port', async () => {
  const response = await worker.fetch(new Request(`${origin}/callback?state=${state}&code=abc`), env);
  assert.equal(response.headers.get('Location'), `http://127.0.0.1:48291/callback?state=${state}&code=abc`);
  const invalid = await worker.fetch(new Request(`${origin}/callback?state=https://example.com&code=abc`), env);
  assert.equal(invalid.status, 400);
});

test('exchange keeps the client secret server-side', async () => {
  const oldFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = init;
    return new Response(JSON.stringify({ access_token: 'test-token' }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request(`${origin}/exchange`, {
      method: 'POST', body: JSON.stringify({ code: 'abc' }),
    }), env);
    assert.equal(response.status, 200);
    assert.equal(sent.body.get('client_secret'), env.GITHUB_CLIENT_SECRET);
    assert.equal((await response.json()).access_token, 'test-token');
  } finally { globalThis.fetch = oldFetch; }
});
