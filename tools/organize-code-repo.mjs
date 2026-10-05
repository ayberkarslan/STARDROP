import { validateTestCatalog } from '../workbench/src/lib/testCatalog.js';

const repository = 'ayberkarslan/stardrop-code-repo';
const token = process.env.STARDROP_PUBLISH_TOKEN?.trim();
if (!token) throw new Error('STARDROP_PUBLISH_TOKEN gerekli.');
async function api(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${route ? '/' + route : ''}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json', 'User-Agent': 'stardrop-repository-organizer' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${method} ${route}`);
  return response.json();
}
const repo = await api('');
const branch = encodeURIComponent(repo.default_branch);
const ref = await api(`git/ref/heads/${branch}`);
const base = await api(`git/commits/${ref.object.sha}`);
const tree = await api(`git/trees/${base.tree.sha}?recursive=1`);
if (tree.truncated) throw new Error('Dosya listesi eksik; taşıma durduruldu.');
const roots = tree.tree.filter(item => !item.path.includes('/'));
if (roots.length === 1 && roots[0].path === 'stardrop') {
  console.log('Depo zaten tek stardrop klasöründe.'); process.exit(0);
}
if (roots.some(item => item.path === 'stardrop')) throw new Error('Karma dizin düzeni; otomatik taşıma durduruldu.');
const legacy = new Set(['Drivers', 'Inc', 'Src', 'Makefile', 'STM32F401xx_FLASH.ld',
  'blackpill.ioc', 'startup_stm32f401xc.s', 'stardrop-project.json', 'README.md']);
const mapPath = input => 'stardrop/' + (legacy.has(input.split('/')[0]) ? 'legacy/blackpill/' : '') + input;
// Reuse existing Git blobs verbatim: no downloads, deletions of content or source rewrites.
const entries = tree.tree.filter(item => item.type !== 'tree').map(item => ({
  path: mapPath(item.path), mode: item.mode, type: item.type, sha: item.sha,
}));
if (new Set(entries.map(item => item.path)).size !== entries.length) throw new Error('Dosya yolu çakışması.');
const catalogFile = await api(`contents/catalog/catalog.json?ref=${ref.object.sha}`);
const catalog = JSON.parse(Buffer.from(catalogFile.content, 'base64').toString());
if (!validateTestCatalog(catalog).valid) throw new Error('Katalog geçersiz; taşıma durduruldu.');
console.log(JSON.stringify({ repository, base: ref.object.sha, files: entries.length,
  libraryRecords: entries.filter(item => item.path.startsWith('stardrop/library/')).length,
  layout: ['stardrop/tests', 'stardrop/catalog', 'stardrop/library', 'stardrop/docs', 'stardrop/legacy/blackpill'],
  mode: process.argv.includes('--apply') ? 'apply' : 'check' }, null, 2));
if (!process.argv.includes('--apply')) process.exit(0);
// Reuse whole directory trees instead of rebuilding thousands of vendor blobs.
const rootEntry = item => ({ path: item.path, mode: item.mode, type: item.type, sha: item.sha });
const legacyTree = await api('git/trees', 'POST', { tree: roots.filter(item => legacy.has(item.path)).map(rootEntry) });
const platformTree = await api('git/trees', 'POST', { tree: [
  ...roots.filter(item => !legacy.has(item.path)).map(rootEntry),
  { path: 'legacy/blackpill', mode: '040000', type: 'tree', sha: legacyTree.sha },
] });
const nextTree = await api('git/trees', 'POST', { tree: [
  { path: 'stardrop', mode: '040000', type: 'tree', sha: platformTree.sha },
] });
const verification = await api(`git/trees/${nextTree.sha}?recursive=1`);
if (verification.truncated) throw new Error('Taşınan dosya listesi eksik.');
const after = new Map(verification.tree.map(item => [item.path, item]));
for (const item of entries) {
  if (after.get(item.path)?.sha !== item.sha || after.get(item.path)?.mode !== item.mode) {
    throw new Error('Dosya doğrulaması başarısız: ' + item.path);
  }
}
const commit = await api('git/commits', 'POST', { message: 'test arşivini düzenle',
  tree: nextTree.sha, parents: [ref.object.sha] });
await api(`git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
console.log(`Taşındı: https://github.com/${repository}/commit/${commit.sha}`);
