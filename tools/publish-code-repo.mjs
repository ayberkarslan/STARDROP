import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateTestCatalog } from '../workbench/src/lib/testCatalog.js';

const repository = 'ayberkarslan/stardrop-code-repo';
const root = fileURLToPath(new URL('../code-repo/', import.meta.url));
const token = process.env.STARDROP_PUBLISH_TOKEN?.trim();
if (!token) throw new Error('STARDROP_PUBLISH_TOKEN gerekli; anahtarı dosyaya koyma.');
const apply = process.argv.includes('--apply');

async function api(route, method = 'GET', body, allowMissing = false) {
  const response = await fetch(`https://api.github.com/repos/${repository}${route ? `/${route}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'stardrop-repository-publisher', 'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${method} ${route}`);
  return response.json();
}

async function readRemote(relative, sha) {
  const result = await api(`contents/${relative}?ref=${sha}`, 'GET', undefined, true);
  return result ? Buffer.from(result.content, 'base64').toString('utf8') : null;
}

async function collect(dir, files = new Map()) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const input = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Kaynak arşivinde symlink olmamalı.');
    if (entry.isDirectory()) { await collect(input, files); continue; }
    if (!entry.isFile()) continue;
    const relative = path.relative(root, input).split(path.sep).join('/');
    if (!relative.startsWith('tests/') && !relative.startsWith('catalog/')
      && !['README.md', '.gitignore'].includes(relative)) throw new Error(`Beklenmeyen kaynak: ${relative}`);
    if (/\.(bin|elf|hex|o|map|lst|ioc)$/.test(relative) || relative.includes('/build/')) {
      throw new Error(`Derleme çıktısı yayınlanamaz: ${relative}`);
    }
    files.set(relative, await fs.readFile(input, 'utf8'));
  }
  return files;
}

const repo = await api('');
const branch = repo.default_branch;
const ref = await api(`git/ref/heads/${encodeURIComponent(branch)}`);
const base = await api(`git/commits/${ref.object.sha}`);
const tree = await api(`git/trees/${base.tree.sha}?recursive=1`);
if (tree.truncated) throw new Error('Uzak dosya listesi eksik; yayın durduruldu.');
const prefix = tree.tree.some(item => item.path === 'stardrop' && item.type === 'tree') ? 'stardrop/' : '';
const files = await collect(root);
const incoming = JSON.parse(files.get('catalog/catalog.json'));
const previous = await readRemote(prefix + 'catalog/catalog.json', ref.object.sha);
const catalog = previous ? JSON.parse(previous) : { schemaVersion: 2, devices: [], tests: [] };
// Only replace our LED entries. Other tests and all team library records stay intact.
const devices = new Map((catalog.devices || []).map(item => [item.id, item]));
for (const item of incoming.devices) if (!devices.has(item.id)) devices.set(item.id, item);
const tests = new Map((catalog.tests || []).map(item => [item.id, item]));
for (const item of incoming.tests) {
  if (['led-blink', 'led-blink-f446'].includes(item.id) || !tests.has(item.id)) tests.set(item.id, item);
}
catalog.devices = [...devices.values()];
catalog.tests = [...tests.values()];
const validation = validateTestCatalog(catalog);
if (!validation.valid) throw new Error(`Katalog birleşimi geçersiz: ${validation.errors.join('; ')}`);
files.set('catalog/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
files.set('docs/stardrop-tests.md', files.get('README.md'));
files.delete('README.md');
const ignore = await readRemote(prefix + '.gitignore', ref.object.sha) || '';
const existing = new Set(ignore.split('\n'));
const additions = files.get('.gitignore').split('\n').filter(line => line && !existing.has(line));
files.set('.gitignore', ignore + (ignore.endsWith('\n') || !ignore ? '' : '\n') + additions.join('\n') + (additions.length ? '\n' : ''));
const remote = new Map(tree.tree.map(item => [item.path, item]));
const changed = [...files].filter(([relative, content]) => {
  const bytes = Buffer.from(content);
  const sha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  return remote.get(prefix + relative)?.sha !== sha;
});
console.log(JSON.stringify({ repository, branch, base: ref.object.sha,
  changedFiles: changed.length, libraryFilesPreserved: tree.tree.filter(item => item.path.startsWith(prefix + 'library/')).length,
  tests: catalog.tests.map(item => ({ id: item.id, status: item.status, sourcePath: item.sourcePath })),
  mode: apply ? 'apply' : 'check' }, null, 2));
if (apply && changed.length) {
  const nextTree = await api('git/trees', 'POST', { base_tree: base.tree.sha,
    tree: changed.map(([relative, content]) => ({ path: prefix + relative, mode: '100644', type: 'blob', content })) });
  const commit = await api('git/commits', 'POST', { message: 'f446 led testini ekle',
    tree: nextTree.sha, parents: [ref.object.sha] });
  await api(`git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', { sha: commit.sha, force: false });
  const verify = await api(`git/trees/${nextTree.sha}?recursive=1`);
  if (verify.truncated) throw new Error('Yükleme sonrası dosya listesi eksik.');
  const after = new Map(verify.tree.map(item => [item.path, item]));
  for (const item of tree.tree.filter(item => item.path.startsWith(prefix + 'library/'))) {
    if (after.get(item.path)?.sha !== item.sha) throw new Error('Ekip kaydı doğrulaması başarısız.');
  }
  const verifyCatalog = JSON.parse(await readRemote(prefix + 'catalog/catalog.json', commit.sha));
  if (!validateTestCatalog(verifyCatalog).valid) throw new Error('Yayınlanan katalog doğrulanamadı.');
  console.log(`Yayınlandı: https://github.com/${repository}/commit/${commit.sha}`);
} else console.log(apply ? 'Kaynaklar zaten güncel.' : 'Kontrol tamamlandı; uzak repoda değişiklik yapılmadı.');
