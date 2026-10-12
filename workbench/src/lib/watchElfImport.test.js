import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWatchFile } from './watchElfImport.js';
const file = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
test('ELF importer returns native variables', async () => {
  const result = await inspectWatchFile(file, async (command, args) => {
    assert.equal(command, 'inspect_watch_elf'); assert.deepEqual(args.bytes, [1, 2, 3]);
    return { variables: [{ name: 'pressure_pa' }] };
  });
  assert.equal(result.variables[0].name, 'pressure_pa');
});
test('ELF importer exposes native errors and invalid responses', async () => {
  await assert.rejects(inspectWatchFile(file, async () => { throw 'ELF debug bilgisi yok'; }), error => error === 'ELF debug bilgisi yok');
  await assert.rejects(inspectWatchFile(file, async () => null), /yanıtı geçersiz/);
});
test('ELF file reading and native IPC cannot leave an endless loading state', async () => {
  await assert.rejects(inspectWatchFile(file, () => new Promise(() => {}), 5), /tamamlanamadı/);
  await assert.rejects(inspectWatchFile({ arrayBuffer: () => new Promise(() => {}) }, () => {}, 5), /tamamlanamadı/);
});
