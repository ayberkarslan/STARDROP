// Standalone development build. The application uses its native manifest compiler.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const project = dirname(fileURLToPath(import.meta.url)), repo = resolve(project, '../..');
const manifest = JSON.parse(readFileSync(join(project, 'stardrop-project.json'), 'utf8'));
const output = join(project, 'build'); mkdirSync(output, { recursive: true });
const path = value => {
  const file = value.startsWith('@repo/') ? resolve(repo, value.slice(6)) : resolve(project, value);
  if (relative(repo, file).startsWith('..')) throw new Error('Source outside repository');
  return file;
};
const gcc = process.env.STARDROP_GCC || 'arm-none-eabi-gcc';
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status) throw result.error || new Error(`${command}: ${result.status}`);
};
const arch = ['-mcpu=cortex-m4', '-mthumb', '-mfpu=fpv4-sp-d16', '-mfloat-abi=hard'];
const flags = [...arch, '-Og', '-g', '-gdwarf-4', '-Wall', '-Wextra', '-ffunction-sections', '-fdata-sections',
  ...manifest.defines.map(value => `-D${value}`), ...manifest.includeDirs.flatMap(value => ['-I', path(value)])];
const objects = manifest.sources.map((source, index) => {
  const object = join(output, `${index}.o`);
  run(gcc, ['-c', ...flags, ...(source.endsWith('.s') ? ['-x', 'assembler-with-cpp'] : ['-std=c11']), path(source), '-o', object]);
  return object;
});
const elf = join(output, 'bmp581-f446.elf');
run(gcc, [...arch, ...objects, '-T', path(manifest.linkerScript), '--specs=nano.specs', '--specs=nosys.specs',
  '-Wl,--gc-sections', `-Wl,-Map=${join(output, 'bmp581-f446.map')}`, '-lc', '-lm', '-lnosys', '-o', elf]);
run(gcc.replace(/gcc$/, 'objcopy'), ['-O', 'binary', elf, join(output, 'bmp581-f446.bin')]);
run(gcc.replace(/gcc$/, 'size'), [elf]);
console.log(elf);
