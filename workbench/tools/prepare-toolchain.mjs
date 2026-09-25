import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const version = '14.3.rel1';
const packages = {
  'linux-x64': {
    filename: `arm-gnu-toolchain-${version}-x86_64-arm-none-eabi.tar.xz`,
    sha256: '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd',
  },
  'win32-x64': {
    filename: `arm-gnu-toolchain-${version}-mingw-w64-i686-arm-none-eabi.zip`,
    sha256: '836ebe51fd71b6542dd7884c8fb2011192464b16c28e4b38fddc9350daba5ee8',
  },
};
const selected = packages[`${process.platform}-${process.arch}`];
if (!selected) throw new Error(`Paketli ARM derleyici bu platform için hazırlanmadı: ${process.platform}-${process.arch}`);
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/toolchain');
const gcc = join(directory, 'bin', `arm-none-eabi-gcc${process.platform === 'win32' ? '.exe' : ''}`);
const marker = JSON.stringify({ version, sha256: selected.sha256 });
if (await readFile(join(directory, 'stardrop-toolchain.json'), 'utf8').catch(() => '') === marker && await stat(gcc).then(() => true).catch(() => false)) {
  console.log(`ARM GNU Toolchain ${version} hazır.`);
  process.exit(0);
}

const temp = await mkdtemp(join(tmpdir(), 'stardrop-toolchain-'));
try {
  const archive = join(temp, selected.filename);
  const url = `https://armkeil.blob.core.windows.net/developer/Files/downloads/gnu/${version}/binrel/${selected.filename}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Derleyici indirilemedi: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== selected.sha256) throw new Error('ARM derleyici SHA-256 doğrulaması başarısız.');
  const unpack = join(temp, 'unpacked');
  await mkdir(unpack);
  const extraction = spawnSync('tar', ['-xf', archive, '-C', unpack], { stdio: 'inherit' });
  if (extraction.error || extraction.status !== 0) throw new Error(`Derleyici arşivi açılamadı: ${extraction.error || extraction.status}`);
  const folders = await readdir(unpack);
  const root = folders.length === 1 ? join(unpack, folders[0]) : unpack;
  const bundledGcc = join(root, 'bin', `arm-none-eabi-gcc${process.platform === 'win32' ? '.exe' : ''}`);
  if (!await stat(bundledGcc).then(() => true).catch(() => false)) throw new Error('İndirilen pakette ARM GCC bulunamadı.');
  await rm(directory, { recursive: true, force: true });
  await cp(root, directory, { recursive: true });
  await writeFile(join(directory, 'stardrop-toolchain.json'), marker);
  console.log(`ARM GNU Toolchain ${version} doğrulandı ve paketlemeye hazır.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
