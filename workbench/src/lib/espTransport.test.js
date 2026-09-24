import assert from 'node:assert/strict';
import { espJson } from './espTransport.js';

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return { ok: true, json: async () => url.endsWith('/ping') ? { status: 'ok' } : { status: 'ok', speedMode: 'fast' } };
};
try {
  assert.equal((await espJson('http://192.168.1.3', '/ping')).status, 'ok');
  assert.equal((await espJson('http://192.168.1.3', '/api/programmer/settings', { method: 'POST', body: { speedMode: 'fast' } })).speedMode, 'fast');
  assert.equal(calls[0].url, 'http://192.168.1.3/ping');
  assert.equal(calls[1].options.body, '{"speedMode":"fast"}');
} finally { globalThis.fetch = originalFetch; }
console.log('espTransport tests passed');
