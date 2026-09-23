import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRepository } from './githubClient.js';

test('diagnostics repository parser accepts owner/repo only', () => {
  assert.deepEqual(parseRepository('YRT/stardrop-diagnostics'), { owner: 'YRT', repo: 'stardrop-diagnostics' });
  assert.throws(() => parseRepository('https://github.com/YRT/repo'));
});
