import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../../code-repo/tests/bmp581-f446/', import.meta.url));
const shared = fileURLToPath(new URL('../../code-repo/tests/bmp180-f446/Inc/', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'stardrop-bmp581-test-'));
try {
  const result = spawnSync('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-fsanitize=undefined', '-fno-sanitize-recover=all',
    '-I', join(project, 'tests/mock'), '-I', join(project, 'Inc'), '-I', join(project, 'vendor/bosch'), '-I', shared,
    join(project, 'Src/bmp581_port.c'), join(project, 'vendor/bosch/bmp5.c'), join(project, 'tests/sensor_test.c'), '-lm', '-o', join(temp, 'test')], { stdio: 'inherit' });
  if (result.error || result.status) throw result.error || new Error('BMP581 test build failed');
  const test = spawnSync(join(temp, 'test'), [], { stdio: 'inherit' });
  if (test.error || test.status) throw test.error || new Error('BMP581 test failed');
} finally { rmSync(temp, { recursive: true, force: true }); }
