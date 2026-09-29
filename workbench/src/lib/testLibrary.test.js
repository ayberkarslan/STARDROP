import assert from 'node:assert/strict';
import test from 'node:test';
import { createManualLedProfile } from './boardProfile.js';
import { makeLibraryEntry, searchLibrary, validateLibraryEntry } from './testLibrary.js';

test('library entry generates detailed searchable information without target UID or false success', () => {
  const profile = createManualLedProfile({ name: 'LoRa bench', mcuPart: 'STM32F401CDU6', pin: 'PC13' });
  profile.targetUid = 'secret-device-uid';
  profile.connections[0].approved = true;
  const selectedTest = { id: 'led-blink', name: 'LED Blink', status: 'ready', sourcePath: 'tests/led/stardrop-project.json', result: 'visual' };
  const entry = makeLibraryEntry({ name: 'Kart LED kontrolü', profile, componentRef: 'D1', test: selectedTest, author: 'ayberk', sourceSha: 'abc' });
  assert.equal(validateLibraryEntry(entry), true);
  assert.equal(entry.profile.targetUid, null);
  assert.equal(entry.result.status, 'NOT_RUN');
  assert.deepEqual(entry.pins[0], { role: 'LED', mcuPin: 'PC13', peripheral: 'GPIO' });
  assert.deepEqual(searchLibrary([entry], 'f401 pc13'), [entry]);
  assert.deepEqual(searchLibrary([entry], 'rfm98'), []);
  const passed = makeLibraryEntry({ name: 'Kart LED kontrolü', profile, componentRef: 'D1', test: selectedTest,
    history: [{ componentRef: 'D1', testId: 'led-blink', status: 'PASS', at: '2026-09-29T00:00:00Z', confirmation: 'VISUAL' }] });
  assert.equal(passed.result.status, 'PASS');
  const planned = makeLibraryEntry({ name: 'LoRa bağlantı taslağı', profile, componentRef: 'D1' });
  assert.equal(planned.test.status, 'planned');
  assert.equal(planned.result.status, 'NOT_RUN');
  assert.throws(() => makeLibraryEntry({ name: 'x', profile, componentRef: 'D1', test: selectedTest }));
});
