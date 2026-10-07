import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const secrets = new Map(), uid = '001300155231501920323239', hash = 'a'.repeat(64);
    let counter = 10;
    localStorage.setItem('stardrop.bridge', 'http://192.168.1.3');
    window.watchMock = { calls: 0, mismatch: false, exports: [] };
    const variables = [{ name: 'watch_random', address: 0x20000004, size: 4, kind: 'unsigned', typeName: 'unsigned int' }, { name: 'watch_temperature', address: 0x20000008, size: 4, kind: 'float', typeName: 'float' }];
    window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' } }, transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (command, args = {}) => {
        if (command === 'plugin:event|listen') return 1;
        if (command === 'github_device_start') return JSON.stringify({ user_code: 'MOCK', device_code: 'mock', expires_in: 900, interval: 5 });
        if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock' });
        if (command === 'load_secret') return secrets.get(args.key) || null;
        if (command === 'save_secret') { secrets.set(args.key, args.value); return 'memory'; }
        if (command === 'target_registry_load') return {};
        if (command === 'discover_esp') return [{ ip: '192.168.1.3', replyAddress: '192.168.1.3' }];
        if (command === 'code_repo_status') return { activeSha: null };
        if (command === 'inspect_watch_elf') return { variables, imageSha256: hash, imageSize: 4000 };
        if (command === 'telemetry_export_csv') { window.watchMock.exports.push(args.csv); return '/tmp/watch-mock.csv'; }
        if (command === 'esp_http') {
          if (args.path === '/ping') return JSON.stringify({ status: 'ok' });
          if (args.path === '/api/wifi/status') return JSON.stringify({ connected: true, ssid: 'Mock', ip: '192.168.1.3', rssi: -40 });
          if (args.path === '/api/programmer/status') return JSON.stringify({ watchAvailable: true, telemetryAvailable: true });
          if (args.path === '/api/target/status') return JSON.stringify({ connected: true, uid, model: 'STM32F446', flashSizeKb: 512 });
          if (args.path === '/api/watch/verify') return JSON.stringify(window.watchMock.mismatch ? { valid: false, reason: 'ELF_FIRMWARE_MISMATCH' } : { valid: true, uid, sha256: hash, session: 'session' });
          if (args.path === '/api/watch/read') {
            window.watchMock.calls++;
            const value = (++counter).toString(16).padStart(8, '0').match(/../g).reverse().join('');
            return JSON.stringify({ valid: true, uid, sha256: hash, session: 'session', values: [{ address: variables[0].address, hex: value, stable: true }] });
          }
        }
        return null;
      } };
  });
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname === '/user' ? { login: 'ui-test' } : []) }));
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.locator('[data-rail-tool="monitor"]:visible').waitFor({ timeout: 15000 });
  await page.locator('[data-rail-tool="monitor"]:visible').click();
  await page.getByRole('button', { name: 'Değişkenler', exact: true }).click();
  const monitor = page.locator('.global-watch:visible');
  await monitor.getByLabel('İzleme ELF dosyası').setInputFiles({ name: 'RAMDENEME.elf', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) });
  await monitor.getByLabel('Global değişken ara').fill('watch_random');
  await monitor.getByRole('button', { name: 'EKLE', exact: true }).click();
  await monitor.getByRole('button', { name: 'İZLEMEYİ BAŞLAT' }).click();
  await page.waitForFunction(() => window.watchMock.calls >= 3);
  assert.equal(await monitor.locator('.live-channel h2').innerText(), 'watch_random');
  assert.match(await monitor.locator('.live-value strong').innerText(), /^\d+$/);
  assert.equal(await monitor.getByText('CANLI', { exact: true }).count(), 1);
  assert.equal(await monitor.locator('.watch-chart path').count(), 1);
  await monitor.getByRole('button', { name: 'DURDUR', exact: true }).click();
  await monitor.getByRole('button', { name: 'CSV', exact: true }).click();
  await page.waitForFunction(() => window.watchMock.exports.length === 1);
  assert.match(await page.evaluate(() => window.watchMock.exports[0]), /watch_random/);
  await page.evaluate(() => { window.watchMock.mismatch = true; });
  await monitor.getByRole('button', { name: 'İZLEMEYİ BAŞLAT' }).click();
  await monitor.locator('.live-status.status-error').waitFor();
  assert.match(await monitor.getByRole('status').innerText(), /ELF/);
  assert.equal(await monitor.locator('.live-value strong').innerText(), '—');
  await page.evaluate(() => { window.watchMock.mismatch = false; });
  await monitor.getByRole('button', { name: 'İZLEMEYİ BAŞLAT' }).click();
  await monitor.locator('.live-status.status-live').waitFor();
  await page.locator('[data-rail-tool="devices"]:visible').click();
  const count = await page.evaluate(() => window.watchMock.calls);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => window.watchMock.calls), count);
  assert.deepEqual(errors, []);
  console.log('Global watch: ELF, seçim, canlı değer, grafik, CSV, yanlış firmware ve sekme durdurma geçti');
} finally { await browser.close(); }
