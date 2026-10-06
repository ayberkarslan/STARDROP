import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const secrets = new Map(), callbacks = new Map(); let callbackId = 1, counter = 1;
    localStorage.setItem('stardrop.bridge', 'http://192.168.1.3');
    window.liveMock = { calls: 0, frozen: false, error: false, exports: [] };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback(fn) { const id = callbackId++; callbacks.set(id, fn); return id; },
      unregisterCallback(id) { callbacks.delete(id); },
      invoke: async (command, args = {}) => {
        if (command === 'plugin:event|listen') return 1;
        if (command === 'github_device_start') return JSON.stringify({ user_code: 'MOCK', device_code: 'mock', expires_in: 900, interval: 5 });
        if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock' });
        if (command === 'load_secret') return secrets.get(args.key) || null;
        if (command === 'save_secret') { secrets.set(args.key, args.value); return 'memory'; }
        if (command === 'target_registry_load') return {};
        if (command === 'discover_esp') return [{ ip: '192.168.1.3', replyAddress: '192.168.1.3' }];
        if (command === 'code_repo_status') return { activeSha: null };
        if (command === 'telemetry_export_csv') { window.liveMock.exports.push(args.csv); return '/tmp/mock-measurements.csv'; }
        if (command === 'esp_http') {
          const uid = '001300155231501920323239';
          if (args.path === '/ping') return JSON.stringify({ status: 'ok' });
          if (args.path === '/api/wifi/status') return JSON.stringify({ connected: true, ssid: 'Mock', ip: '192.168.1.3', rssi: -40 });
          if (args.path === '/api/programmer/status') return JSON.stringify({ telemetryAvailable: true });
          if (args.path === '/api/target/status') return JSON.stringify({ connected: true, uid, model: 'STM32F446', flashSizeKb: 512 });
          if (args.path === '/api/telemetry') {
            window.liveMock.calls++;
            if (window.liveMock.error) throw new Error('Mock ağ kesildi');
            if (!window.liveMock.frozen) counter++;
            return JSON.stringify({ connected: true, valid: true, uid, model: 'STM32F446', abi: 1, sequence: counter * 2,
              timestampMs: counter * 100, sampleCounter: counter, sensorStatus: 1,
              testIdHash: 1, profileHash: 2, runHash: 3, readMs: 12,
              channels: [{ name: 'temperature', unit: 'degC', value: 22 + Math.sin(counter / 3), valid: true },
                { name: 'pressure', unit: 'Pa', value: 100000 + Math.cos(counter / 3) * 100, valid: true }] });
          }
        }
        return null;
      },
    };
  });
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(new URL(route.request().url()).pathname === '/user' ? { login: 'ui-test' } : []) }));
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.locator('[data-rail-tool="monitor"]:visible').waitFor({ timeout: 15000 });
  await page.locator('[data-rail-tool="monitor"]:visible').click();
  const monitor = page.locator('.live-monitor:visible');
  await monitor.getByRole('button', { name: 'İZLEMEYİ BAŞLAT' }).click();
  await monitor.locator('.live-status.status-live').waitFor();
  await monitor.getByRole('button', { name: 'KAYDET', exact: true }).click();
  await page.waitForFunction(() => window.liveMock.calls >= 5);
  assert.equal(await monitor.locator('.live-channel').count(), 2);
  assert.equal(await monitor.locator('.live-channel h2').first().innerText(), 'Sıcaklık');
  await page.screenshot({ path: '/tmp/stardrop-live-monitor.png' });
  await monitor.getByRole('button', { name: 'CSV', exact: true }).click();
  await page.waitForFunction(() => window.liveMock.exports.length === 1);
  assert.match(await page.evaluate(() => window.liveMock.exports[0]), /temperature/);
  await page.evaluate(() => { window.liveMock.frozen = true; });
  await monitor.locator('.live-status.status-stale').waitFor({ timeout: 6000 });
  assert.equal(await monitor.getByText('CANLI', { exact: true }).count(), 0);
  await page.locator('[data-rail-tool="devices"]:visible').click();
  const calls = await page.evaluate(() => window.liveMock.calls);
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.liveMock.calls), calls);
  await page.locator('.workspace-tab').filter({ hasText: 'Canlı İzleme' }).click();
  await monitor.locator('.live-status.status-paused').waitFor();
  await page.evaluate(() => { window.liveMock.error = true; });
  await monitor.getByRole('button', { name: 'İZLEMEYİ BAŞLAT' }).click();
  await monitor.locator('.live-status.status-error').waitFor({ timeout: 6000 });
  assert.match(await monitor.getByRole('status').innerText(), /ağ kesildi/);
  assert.deepEqual(errors, []);
  console.log('Canlı izleme: grafik, CSV, eski veri, sekme durdurma ve bağlantı hatası geçti');
} finally { await browser.close(); }
