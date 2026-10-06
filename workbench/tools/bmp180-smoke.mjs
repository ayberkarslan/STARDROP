import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../../code-repo/tests/bmp180-f446/', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'stardrop-bmp180-test-'));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} başarısız`);
}
try {
  const includes = ['-I', join(project, 'tests/mock'), '-I', join(project, 'Inc'), '-I', fileURLToPath(new URL('../../include/', import.meta.url))];
  run('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', ...includes, '-c', join(project, 'Src/stardrop_telemetry.c'), '-o', join(temp, 'telemetry.o')]);
  run('g++', ['-std=c++14', '-Wall', '-Wextra', '-Werror', '-fsanitize=undefined', '-fno-sanitize-recover=all', ...includes,
    join(project, 'Src/bmp180.cpp'), join(project, 'tests/sensor_test.cpp'), join(temp, 'telemetry.o'), '-o', join(temp, 'test')]);
  run(join(temp, 'test'), []);
} finally { rmSync(temp, { recursive: true, force: true }); }
