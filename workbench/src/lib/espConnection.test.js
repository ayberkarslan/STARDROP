import assert from 'node:assert/strict';
import { discoveryCandidates, normalizeEspAddress } from './espConnection.js';

assert.equal(normalizeEspAddress('192.168.1.3'), 'http://192.168.1.3');
assert.equal(normalizeEspAddress('http://192.168.4.1/'), 'http://192.168.4.1');
assert.throws(() => normalizeEspAddress('https://192.168.1.3'), /http:\/\/IP/);
assert.throws(() => normalizeEspAddress('http://192.168.1.3/other'), /http:\/\/IP/);
const candidates = discoveryCandidates([
  { mac: 'one', replyAddress: '192.168.1.4', ip: '192.168.1.4' },
  { mac: 'two', replyAddress: '192.168.1.3', ip: '192.168.1.3' },
], 'http://192.168.4.1', 'two');
assert.deepEqual(candidates, ['http://192.168.1.3', 'http://192.168.1.4', 'http://192.168.4.1']);
console.log('espConnection tests passed');
