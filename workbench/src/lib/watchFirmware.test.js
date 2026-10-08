import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHardwareGate } from './hardwareGate.js';
import { reloadWatchFirmware } from './watchFirmware.js';

const uid = '001300155231501920323239', model = 'STM32F446';
const bytes = new Uint8Array(64), file = new File([bytes], 'example.elf');
const hash = 'f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b';
function setup(overrides = {}) {
  const hardware = createHardwareGate(), lease = hardware.acquire('watch', 'İzleme');
  const calls = [], notices = [];
  const options = { hardware, lease, file, uid, model, base: 'http://192.168.1.3', imageSha256: hash, imageSize: 64,
    prepare: async () => new File([bytes], 'example.bin'),
    json: async () => { calls.push('target'); return { connected: true, uid, model, flashSizeKb: 512 }; },
    upload: async () => { calls.push('upload'); }, stream: async () => { calls.push('flash'); },
    onNotice: message => notices.push(message), onLoaded: () => calls.push('loaded'), ...overrides };
  return { hardware, lease, calls, notices, run: () => reloadWatchFirmware(options) };
}
test('reload checks image, target twice, holds lease and emits completion', async () => {
  const item = setup(); await item.run();
  assert.deepEqual(item.calls, ['target', 'upload', 'target', 'flash', 'loaded']);
  assert.ok(item.hardware.owns(item.lease));
  assert.match(item.notices[0], /ELF uyuşmuyor/); assert.match(item.notices.at(-1), /example.elf yüklendi/);
});
test('wrong image or target never starts flashing', async () => {
  for (const overrides of [
    { imageSha256: 'a'.repeat(64) }, { imageSize: 65 },
    { json: async () => ({ connected: true, uid: 'a'.repeat(24), model }) },
    { json: async () => ({ connected: true, uid, model: 'STM32F401' }) },
  ]) {
    const item = setup(overrides); await assert.rejects(item.run()); assert.equal(item.calls.includes('flash'), false); assert.equal(item.calls.includes('loaded'), false);
  }
});
test('stopping during ESP upload prevents starting flash', async () => {
  let stopped = false;
  const item = setup({ isStopped: () => stopped, upload: async () => { stopped = true; } });
  await assert.rejects(item.run(), /durduruldu/); assert.equal(item.calls.includes('flash'), false);
});
test('target swap after upload prevents starting flash', async () => {
  let targets = 0;
  const item = setup({ json: async () => ({ connected: true, uid: ++targets === 1 ? uid : 'a'.repeat(24), model }) });
  await assert.rejects(item.run(), /hedefi değişti/); assert.equal(item.calls.includes('flash'), false);
});
test('flash failure never reports loaded or success', async () => {
  const item = setup({ stream: async () => { throw new Error('SWD hata'); } });
  await assert.rejects(item.run(), /SWD/); assert.equal(item.calls.includes('loaded'), false); assert.equal(item.notices.some(text => /yüklendi/.test(text)), false);
});
test('invalid lease stops before network activity', async () => {
  const item = setup(); item.hardware.release(item.lease);
  await assert.rejects(item.run(), /kilidi/); assert.equal(item.calls.length, 0);
});
