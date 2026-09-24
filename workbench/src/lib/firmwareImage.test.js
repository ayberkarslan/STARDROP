import assert from 'node:assert/strict';
import { elfToBin } from './firmwareImage.js';

const header = new Uint8Array(128);
const view = new DataView(header.buffer);
header.set([0x7f, 0x45, 0x4c, 0x46, 1, 1]);
view.setUint16(18, 40, true);
view.setUint32(28, 52, true);
view.setUint16(42, 32, true);
view.setUint16(44, 1, true);
view.setUint32(52, 1, true);
view.setUint32(56, 96, true);
view.setUint32(64, 0x08000000, true);
view.setUint32(68, 4, true);
header.set([1, 2, 3, 4], 96);
assert.deepEqual([...elfToBin(header.buffer)], [1, 2, 3, 4]);
view.setUint32(64, 0x08004000, true);
assert.throws(() => elfToBin(header.buffer), /0x08000000/);
console.log('firmwareImage tests passed');
