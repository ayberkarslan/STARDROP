import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [profilePath, componentRef, testId, outputDirectory = 'out', requestId = 'local'] = process.argv.slice(2);
if (!profilePath || !componentRef || !testId) throw new Error('Kullanım: node tools/build-firmware.mjs profile.json COMPONENT_REF TEST_ID [out]');

const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const catalog = JSON.parse(await readFile(join(root, 'catalog/catalog.json'), 'utf8'));
const test = catalog.tests.find((item) => item.id === testId);
if (!test || test.status !== 'ready' || !/^templates\/[a-z0-9_-]+\.c$/.test(test.sourcePath || '')) throw new Error('Bu test için derlenebilir şablon yok.');
const part = String(profile.mcu?.part || '').toUpperCase();
const target = part.startsWith('STM32F401CC') ? 'stm32f401cc' : part.startsWith('STM32F446RE') ? 'stm32f446re' : null;
if (!target) throw new Error('Yalnız STM32F401CC ve STM32F446RE için firmware derlenebilir.');
if (!test.supportedMcu.includes(profile.mcu.family)) throw new Error('MCU bu testi desteklemiyor.');
const component = profile.components?.find((item) => item.ref === componentRef);
if (!component) throw new Error('Seçilen bileşen profilde yok.');
if (!test.matchParts.some((pattern) => String(component.part).toUpperCase().includes(pattern.toUpperCase())) && testId !== 'generic-i2c') throw new Error('Test, seçilen parça ile eşleşmiyor.');
if (component.protocol !== 'I2C') throw new Error('Bu firmware yalnız I2C sensörleri destekler.');
const pins = profile.connections.filter((item) => item.componentRef === componentRef);
const scl = pins.find((item) => item.role === 'SCL');
const sda = pins.find((item) => item.role === 'SDA');
if (!scl || !sda || !scl.approved || !sda.approved || scl.peripheral !== sda.peripheral) throw new Error('Onaylı ve aynı bus üzerindeki SCL/SDA bağlantıları gerekli.');
function parsePin(value) {
  const match = /^P([ABC])(\d{1,2})$/.exec(value || '');
  if (!match) throw new Error(`Desteklenmeyen GPIO: ${value}`);
  const port = match[1].charCodeAt(0) - 65;
  const pin = Number(match[2]);
  if (pin > 15 || (port === 0 && (pin === 13 || pin === 14))) throw new Error(`SWD veya geçersiz GPIO: ${value}`);
  if (target === 'stm32f401cc' && port === 2 && pin < 13) throw new Error(`F401CC paketinde bulunmayan GPIO: ${value}`);
  return { port, pin };
}
const sclPin = parsePin(scl.mcuPin);
const sdaPin = parsePin(sda.mcuPin);
if (scl.mcuPin === sda.mcuPin) throw new Error('SCL ve SDA farklı GPIO olmalı.');
const out = resolve(outputDirectory);
await mkdir(out, { recursive: true });
const hash32 = (value) => `0x${createHash('sha256').update(value).digest('hex').slice(0, 8)}UL`;
const header = `#pragma once\n#define STARDROP_SCL_PORT ${sclPin.port}\n#define STARDROP_SCL_PIN ${sclPin.pin}\n#define STARDROP_SDA_PORT ${sdaPin.port}\n#define STARDROP_SDA_PIN ${sdaPin.pin}\n#define STARDROP_TEST_ID_HASH ${hash32(testId)}\n#define STARDROP_PROFILE_HASH ${hash32(JSON.stringify(profile))}\n#define STARDROP_RUN_HASH ${hash32(requestId)}\n`;
await writeFile(join(out, 'generated_config.h'), header);
const elf = join(out, `${testId}-${target}.elf`);
const bin = join(out, `${testId}-${target}.bin`);
const shared = ['-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=soft', '-Os', '-std=c11', '-ffreestanding', '-fno-builtin', '-ffunction-sections', '-fdata-sections', '-Wall', '-Wextra', '-Werror'];
const args = [...shared, '-I', out, '-I', join(root, 'runtime'), '-I', join(root, 'firmware'),
  join(root, 'firmware/startup.c'), join(root, 'firmware/main.c'), join(root, 'firmware/platform_i2c.c'),
  join(root, 'runtime/stardrop_diagnostic_report.c'), join(root, test.sourcePath),
  '-nostdlib', '-Wl,--gc-sections', '-T', join(root, `firmware/${target}.ld`), '-lgcc', '-o', elf];
const compiled = spawnSync('arm-none-eabi-gcc', args, { stdio: 'inherit' });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) throw new Error(`ARM derlemesi başarısız (${compiled.status}).`);
const converted = spawnSync('arm-none-eabi-objcopy', ['-O', 'binary', elf, bin], { stdio: 'inherit' });
if (converted.error) throw converted.error;
if (converted.status !== 0) throw new Error('BIN oluşturulamadı.');
const bytes = await readFile(bin);
const manifest = { schemaVersion: 1, testId, componentRef, requestId, mcuPart: part, profileId: profile.id, targetUid: profile.targetUid || null,
  pins: { scl: scl.mcuPin, sda: sda.mcuPin }, size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), sourcePath: test.sourcePath };
await writeFile(join(out, 'artifact.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ bin, manifest }));
