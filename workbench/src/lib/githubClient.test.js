import assert from 'node:assert/strict';
import test from 'node:test';
import { listLibraryEntries, parseRepository, publishLibraryEntry } from './githubClient.js';

test('diagnostics repository parser accepts owner/repo only', () => {
  assert.deepEqual(parseRepository('YRT/stardrop-diagnostics'), { owner: 'YRT', repo: 'stardrop-diagnostics' });
  assert.throws(() => parseRepository('https://github.com/YRT/repo'));
});

test('GitHub library treats a missing directory as empty and writes one immutable file', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      if (options.method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'abc' } }), { status: 201 });
      if (url.endsWith('/repos/team/tests') || url.endsWith('/repos/team/tests/branches/main')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    };
    assert.deepEqual(await listLibraryEntries({ token: 'fake', repository: 'team/tests' }), []);
    const entry = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'LED düzeni' };
    await publishLibraryEntry({ token: 'fake', repository: 'team/tests', entry });
    const put = requests.at(-1);
    assert.match(put.url, /\/repos\/team\/tests\/contents\/library\/123e4567-e89b-12d3-a456-426614174000\.json$/);
    assert.equal(put.options.method, 'PUT');
    assert.equal(JSON.parse(put.options.body).sha, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('missing private repository is not mistaken for an empty library', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    await assert.rejects(listLibraryEntries({ token: 'fake', repository: 'team/tests' }), /deposu bu kimlikle görünmüyor/);
    await assert.rejects(publishLibraryEntry({ token: 'fake', repository: 'team/tests', entry: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'LED' } }), /deposu bu kimlikle görünmüyor/);
  } finally { globalThis.fetch = originalFetch; }
});
