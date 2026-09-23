import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [profileFile, componentRef, testId, bridge = 'http://192.168.4.1', confirm] = process.argv.slice(2);
if (!profileFile || !componentRef || !testId) throw new Error('Kullanım: node tools/run-local.mjs PROFILE.json REF TEST_ID [ESP_URL] [--flash]');
const requestId = randomUUID();
const output = resolve(root, '../.stardrop-cache/local');
await mkdir(output, { recursive: true });
const built = spawnSync(process.execPath, [join(root, 'tools/build-firmware.mjs'), resolve(profileFile), componentRef, testId, output, requestId], { stdio: 'inherit' });
if (built.error) throw built.error;
if (built.status !== 0) throw new Error('Yerel ARM derlemesi başarısız.');
const manifest = JSON.parse(await readFile(join(output, 'artifact.json'), 'utf8'));
const bin = await readFile(join(output, `${testId}-${manifest.mcuPart.startsWith('STM32F401CC') ? 'stm32f401cc' : 'stm32f446re'}.bin`));
const sha = (value) => createHash('sha256').update(value).digest('hex');
if (sha(bin) !== manifest.sha256) throw new Error('Yerel BIN SHA-256 uyuşmazlığı.');
if (confirm !== '--flash') {
  console.log('Firmware derlendi. Gerçek kartı silip yüklemek için komut sonuna --flash ekle.');
  process.exit(0);
}

const base = bridge.replace(/\/$/, '');
async function targetStatus() {
  const response = await fetch(`${base}/api/target/status`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`ESP hedef sorgusu HTTP ${response.status}`);
  const target = await response.json();
  if (!target.connected || !target.model?.startsWith(manifest.mcuPart.slice(0, 9))) throw new Error('Bağlı MCU ile firmware ailesi uyuşmuyor.');
  if (!/^[0-9A-F]{24}$/.test(target.uid || '') || /^0+$/.test(target.uid)) throw new Error('STM32 UID okunamadı; yanlış karta flash riskinden dolayı durduruldu.');
  if (target.flashSizeKb && bin.length > target.flashSizeKb * 1024) throw new Error('BIN hedef flash kapasitesini aşıyor.');
  return target;
}
const target = await targetStatus();
const repeat = await targetStatus();
if (target.uid !== repeat.uid) throw new Error('Hedef kart değişti; flash iptal edildi.');
console.log(`Hedef ${target.model} UID ${target.uid}. Mevcut firmware test firmware'iyle değiştirilecek.`);
const body = new FormData();
body.append('firmware', new Blob([bin], { type: 'application/octet-stream' }), `${testId}.bin`);
const upload = await fetch(`${base}/upload`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
if (!upload.ok) throw new Error(`ESP yükleme HTTP ${upload.status}`);
const stream = await fetch(`${base}/stream-flash`, { signal: AbortSignal.timeout(180000) });
if (!stream.ok || !stream.body) throw new Error('Flash SSE akışı açılmadı.');
const reader = stream.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let finished = false;
while (!finished) {
  const { value, done } = await reader.read();
  if (done) throw new Error('Flash akışı tamamlanmadan kesildi.');
  buffer += decoder.decode(value, { stream: true });
  let split;
  while ((split = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
    const line = frame.split('\n').find((item) => item.startsWith('data: '));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));
    if (event.msg) console.log(event.msg);
    if (event.error) throw new Error(event.msg || 'SWD flash hatası.');
    if (event.done) { finished = true; break; }
  }
}
await reader.cancel();
const hash32 = (value) => parseInt(sha(value).slice(0, 8), 16) >>> 0;
const expected = { test: hash32(testId), profile: hash32(JSON.stringify(JSON.parse(await readFile(profileFile, 'utf8')))), run: hash32(requestId) };
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/api/diagnostic/report`, { signal: AbortSignal.timeout(2500) });
    const report = await response.json();
    if (report.valid && (parseInt(report.testIdHash, 16) >>> 0) === expected.test
      && (parseInt(report.profileHash, 16) >>> 0) === expected.profile
      && (parseInt(report.runHash, 16) >>> 0) === expected.run
      && ['PASS', 'FAIL', 'FATAL'].includes(report.state)) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.state === 'PASS' ? 0 : 1);
    }
  } catch (_) { /* SWD reset penceresinde tekrar dene. */ }
  await new Promise((resolve) => setTimeout(resolve, 750));
}
throw new Error('STM32 bu çalıştırmaya ait geçerli tanı raporu üretmedi.');
