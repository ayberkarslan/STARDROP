import assert from 'node:assert/strict';
import { espJson, espStream } from './espTransport.js';

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

const encode = value => new TextEncoder().encode(value);
const frames = values => new ReadableStream({ start(controller) {
  for (const value of values) controller.enqueue(encode(value));
  controller.close();
} });
try {
  let requests = 0;
  const events = [];
  globalThis.fetch = async (_, options) => {
    requests++;
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).uid, 'test-target');
    return { ok: true, body: frames(['data: {"stage":"erasing","pct":25}\n', '\ndata: {"stage":"verifying","pct":50}\n\ndata: {"done":true,"pct":100}\n\n']) };
  };
  assert.equal((await espStream('http://192.168.1.3', '/stream-target-maintenance', event => events.push(event), 1000,
    { method: 'POST', body: { operation: 'erase', uid: 'test-target' } })).done, true);
  assert.deepEqual(events.map(event => event.pct), [25, 50, 100]);
  assert.equal(requests, 1);
  globalThis.fetch = async () => ({ ok: true, body: frames(['data: {"error":true,"msg":"SWD read failed"}\n\n']) });
  await assert.rejects(espStream('http://192.168.1.3', '/stream-target-maintenance', null, 1000, { method: 'POST', body: {} }), /SWD read failed/);
  globalThis.fetch = async () => ({ ok: true, body: frames(['data: {"stage":"erasing","pct":25}\n\n']) });
  await assert.rejects(espStream('http://192.168.1.3', '/stream-target-maintenance', null, 1000, { method: 'POST', body: {} }), /son durum bilinmiyor/);
  globalThis.fetch = async () => ({ ok: false, status: 409 });
  await assert.rejects(espStream('http://192.168.1.3', '/stream-target-maintenance', null, 1000, { method: 'POST', body: {} }), /HTTP 409/);
} finally { globalThis.fetch = originalFetch; }
console.log('Maintenance progress, failure and incomplete stream tests passed');
