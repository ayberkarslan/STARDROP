import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { profileFromNetlist } from './netlistProfile.js';
import { createManualI2cProfile, validateTestTarget } from './boardProfile.js';
import { readDiagnosticArtifact } from './diagnosticArtifact.js';
import { DEFAULT_TEST_CATALOG, testForComponent } from './testCatalog.js';

const diagnostics = resolve(import.meta.dirname, '../../../diagnostics');
const builder = join(diagnostics, 'tools/build-firmware.mjs');
const uid = '004B00344231501920393037';

function netlist(part, scl, sda) {
  return `Wire List
<<< Component List >>>
${part} U1 ${part}
BMP180 U2 Pressure sensor
<<< Wire List >>>
[00001] SENSOR_SCL
 U1 1 ${scl} PASSIVE ${part}
 U2 1 SCL PASSIVE BMP180
[00002] SENSOR_SDA
 U1 2 ${sda} PASSIVE ${part}
 U2 2 SDA PASSIVE BMP180
`;
}

for (const fixture of [
  { part: 'STM32F401CCU6', scl: 'PB6', sda: 'PB7', target: 'stm32f401cc', bus: 'I2C1' },
  { part: 'STM32F446RET6', scl: 'PA0', sda: 'PA1', target: 'stm32f446re', bus: 'SOFT_I2C_1' },
  { part: 'STM32F401CDU6', scl: 'PB0', sda: 'PB1', target: 'stm32f401cc', bus: 'SOFT_I2C_1', manual: true },
]) {
  test(`${fixture.part} ${fixture.manual ? 'manual profile' : 'NET'}-to-BIN pipeline validates selected BMP180 pins`, async () => {
    const output = await mkdtemp(join(tmpdir(), 'stardrop-pipeline-'));
    try {
      const profile = fixture.manual
        ? createManualI2cProfile({ name: 'Breadboard', mcuPart: fixture.part, componentRef: 'U2', componentPart: 'BMP180', scl: fixture.scl, sda: fixture.sda })
        : profileFromNetlist(netlist(fixture.part, fixture.scl, fixture.sda)).profile;
      const component = profile.components.find((item) => item.ref === 'U2');
      assert.equal(testForComponent(DEFAULT_TEST_CATALOG, component, profile.mcu.part)?.id, 'bmp180');
      assert.deepEqual(profile.connections.map((item) => item.peripheral), [fixture.bus, fixture.bus]);
      profile.targetUid = uid;
      profile.connections.forEach((item) => { item.approved = true; });
      assert.equal(validateTestTarget(profile, 'U2').valid, true);

      const profileFile = join(output, 'profile.json');
      const requestId = `pipeline-${fixture.target}`;
      await writeFile(profileFile, JSON.stringify(profile));
      execFileSync(process.execPath, [builder, profileFile, 'U2', 'bmp180', output, requestId], { cwd: diagnostics, stdio: 'pipe' });

      const manifest = JSON.parse(await readFile(join(output, 'artifact.json'), 'utf8'));
      const binName = `bmp180-${fixture.target}.bin`;
      const bin = await readFile(join(output, binName));
      assert.equal(manifest.sha256, createHash('sha256').update(bin).digest('hex'));
      const zip = new JSZip();
      zip.file('artifact.json', JSON.stringify(manifest));
      zip.file(binName, bin);
      const packed = await zip.generateAsync({ type: 'uint8array' });
      const artifact = await readDiagnosticArtifact(packed, {
        testId: 'bmp180', componentRef: 'U2', requestId, profileId: profile.id,
        targetUid: uid, mcuPart: fixture.part, sourcePath: 'templates/bmp180.c',
        scl: fixture.scl, sda: fixture.sda, flashSizeKb: fixture.target === 'stm32f401cc' ? 256 : 512,
      });
      assert.equal(artifact.firmware.size, bin.length);
      const header = await readFile(join(output, 'generated_config.h'), 'utf8');
      assert.match(header, /#define STARDROP_SCL_PORT/);
      assert.match(header, /#define STARDROP_SDA_PIN/);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
}
