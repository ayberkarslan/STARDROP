import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings, redact, measurement, makeBackup, parseBackup, readiness } from './settings.js';

test('defaults preserve the trusted repository and reject unsupported settings', () => {
  assert.deepEqual(validateSettings(), DEFAULT_SETTINGS);
  assert.throws(() => validateSettings({ intervalMs: 1 }));
  assert.equal(validateSettings({ intervalMs: 1000 }).watchIntervalMs, 250);
  assert.equal(validateSettings({ watchIntervalMs: 225 }).intervalMs, 500);
  assert.throws(() => validateSettings({ watchIntervalMs: 50 }));
  assert.throws(() => validateSettings({ trustedRepository: '../outside' }));
  assert.throws(() => validateSettings({ exportDirectory: '\0' }));
  assert.equal(validateSettings({ token: 'never store' }).token, undefined);
});
test('display units do not change the recorded sample', () => {
  const raw = { value: 20, unit: 'degC' };
  assert.equal(measurement(raw, { temperatureUnit: 'F' }).value, 68);
  assert.deepEqual(raw, { value: 20, unit: 'degC' });
  assert.equal(measurement({ value: 100000, unit: 'Pa' }, { pressureUnit: 'hPa' }).value, 1000);
});
test('reports exclude credentials and redact codes embedded in messages', () => {
  const report = redact({ password: 'hidden', nested: { access_token: 'hidden', message: 'ghp_TESTONLY Bearer TESTONLY https://localhost/callback?code=test&state=test' } });
  assert.equal(report.password, undefined);
  assert.equal(report.nested.access_token, undefined);
  assert.ok(!JSON.stringify(report).includes('TESTONLY'));
  assert.ok(!JSON.stringify(report).includes('=test'));
});
test('backup import resets target binding and pin approvals', () => {
  const uid = '001300155231501920323239';
  const profile = { schemaVersion: 1, id: 'old', name: 'LED', mcu: { part: 'STM32F446RET6' }, targetUid: uid,
    components: [{ ref: 'D1', part: 'LED' }], connections: [{ componentRef: 'D1', role: 'GPIO', mcuPin: 'PA5', approved: true }] };
  const backup = makeBackup({ preferences: { rememberRepo: true }, githubConfig: { repository: DEFAULT_SETTINGS.trustedRepository, ref: 'main', token: 'hidden' },
    records: { [uid]: { uid, label: 'Kart', model: 'STM32F446', createdAt: 1, updatedAt: 2 } }, profiles: [profile] });
  const restored = parseBackup(JSON.stringify(backup));
  assert.equal(restored.preferences.rememberRepo, false);
  assert.equal(restored.githubConfig.token, undefined);
  assert.equal(restored.profiles[0].targetUid, null);
  assert.equal(restored.profiles[0].connections[0].approved, false);
  assert.notEqual(restored.profiles[0].id, profile.id);
  backup.records[uid].label = 'x'.repeat(33);
  assert.throws(() => parseBackup(JSON.stringify(backup)));
});
test('preparing code does not imply a connected or telemetry-compatible target', () => {
  const rows = readiness({ compiler: { ready: true }, sourceStatus: { activeSha: 'sha', offline: true }, esp: {}, target: {} });
  assert.equal(rows[0].ready, true);
  assert.equal(rows[1].ready, false);
  assert.equal(rows[2].ready, false);
});
