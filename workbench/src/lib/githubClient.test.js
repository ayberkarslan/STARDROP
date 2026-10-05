import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCatalogDocument, saveCatalogDocument, listLibraryEntries, parseRepository, publishLibraryEntry } from './githubClient.js';

test('single-folder repository reads catalog and team records and writes only under stardrop', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const record = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Test' };
  const encode = value => ({ encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64'), sha: 'blob' });
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      let body;
      if (options.method === 'PUT') body = {};
      else if (url.includes('/contents/stardrop?')) body = [];
      else if (url.includes('/contents/stardrop/catalog/catalog.json?')) body = encode({ tests: [] });
      else if (url.includes('/contents/stardrop/library?')) body = [{ type: 'file', name: record.id + '.json', path: 'stardrop/library/' + record.id + '.json' }];
      else if (url.includes('/contents/stardrop/library/' + record.id)) body = encode(record);
      else throw new Error('Unexpected path: ' + url);
      return new Response(JSON.stringify(body), { status: 200 });
    };
    assert.deepEqual((await fetchCatalogDocument({ token: 'fake', repository: 'team/tests' })).catalog, { tests: [] });
    assert.deepEqual(await listLibraryEntries({ token: 'fake', repository: 'team/tests' }), [record]);
    await publishLibraryEntry({ token: 'fake', repository: 'team/tests', entry: record });
    await saveCatalogDocument({ token: 'fake', repository: 'team/tests', catalog: { tests: [] }, sha: 'blob' });
    assert.equal(requests.filter(request => request.options.method === 'PUT').length, 2);
    assert.ok(requests.filter(request => request.options.method === 'PUT').every(request => request.url.includes('/contents/stardrop/')));
  } finally { globalThis.fetch = originalFetch; }
});

test('authentication errors never fall back to an old repository layout', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response('{"message":"Bad credentials"}', { status: 401 }); };
    await assert.rejects(fetchCatalogDocument({ token: 'fake', repository: 'team/tests' }), /401/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

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

test('library publication distinguishes a missing branch from missing write permission', async () => {
  const originalFetch = globalThis.fetch;
  const entry = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'LED' };
  try {
    globalThis.fetch = async (url) => new Response(JSON.stringify({ message: 'Not Found' }), { status: url.endsWith('/repos/team/tests') ? 200 : 404 });
    await assert.rejects(publishLibraryEntry({ token: 'fake', repository: 'team/tests', ref: 'wrong', entry }), /wrong dalı bulunamadı/);
    globalThis.fetch = async (url) => new Response(JSON.stringify({ message: 'Not Found' }), { status: url.endsWith('/repos/team/tests') || url.endsWith('/branches/main') ? 200 : 404 });
    await assert.rejects(publishLibraryEntry({ token: 'fake', repository: 'team/tests', entry }), /Contents: Read and write/);
  } finally { globalThis.fetch = originalFetch; }
});
