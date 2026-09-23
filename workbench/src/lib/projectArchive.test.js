import assert from 'node:assert/strict';
import test from 'node:test';
import { newBoardProfile } from './boardProfile.js';
import { exportStardropProject, importStardropProject } from './projectArchive.js';

test('a stardrop archive retains sources, artifact and test history', async () => {
  const profile = newBoardProfile({ name: 'Telemetry', mcuPart: 'STM32F446RE' });
  const data = await exportStardropProject({
    profile,
    netlist: '<<< Component List >>>',
    bom: 'Ref,Value',
    schematicPdf: new Blob(['pdf']),
    artifacts: [{ name: 'bmp180.bin', data: new Blob(['firmware']) }],
    testHistory: [{ status: 'PASS', test: 'BMP180' }],
  });
  const imported = await importStardropProject(data);
  assert.equal(imported.profile.name, 'Telemetry');
  assert.equal(imported.artifacts[0].name, 'bmp180.bin');
  assert.equal(imported.testHistory[0].status, 'PASS');
  assert.ok(imported.sources['sources/schematic.pdf']);
});
