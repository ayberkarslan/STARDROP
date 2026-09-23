import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { readDiagnosticArtifact, sha256Hex } from './diagnosticArtifact.js';

const expected = { testId: 'bmp180', componentRef: 'U1', requestId: 'request-1', profileId: 'board-1', mcuPart: 'STM32F401CCU6', sourcePath: 'templates/bmp180.c', scl: 'PB6', sda: 'PB7', flashSizeKb: 256 };

async function fixture(overrides = {}) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sha256 = await sha256Hex(new Blob([bytes]));
  const manifest = { schemaVersion: 1, ...expected, pins: { scl: expected.scl, sda: expected.sda }, size: bytes.length, sha256, ...overrides };
  const zip = new JSZip();
  zip.file('artifact.json', JSON.stringify(manifest));
  zip.file('bmp180-stm32f401cc.bin', bytes);
  return zip.generateAsync({ type: 'uint8array' });
}

test('accepts a matching firmware artifact', async () => {
  const { firmware, manifest } = await readDiagnosticArtifact(await fixture(), expected);
  assert.equal(firmware.size, 4);
  assert.equal(manifest.sha256.length, 64);
});

test('rejects wrong target and tampered bytes before flashing', async () => {
  await assert.rejects(async () => readDiagnosticArtifact(await fixture({ mcuPart: 'STM32F446RE' }), expected), /uyuşmuyor/);
  await assert.rejects(async () => readDiagnosticArtifact(await fixture({ sha256: '0'.repeat(64) }), expected), /SHA-256/);
});
