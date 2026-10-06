import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('stardrop.bridge')) localStorage.setItem('stardrop.bridge', 'http://192.168.1.3');
    const callbacks = new Map(), listeners = new Map(), watches = new Map();
    let next = 1;
    window.requests = [];
    window.watchStarts = 0; window.watchStops = 0;
    window.emitStatus = (data, watchId) => {
      for (const id of watchId ? [watchId] : watches.keys()) {
        for (const { event, handler } of listeners.values()) if (event === 'stardrop-device-status') {
          callbacks.get(handler)?.({ payload: { watchId: id, data } });
        }
      }
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback(callback) { const id = next++; callbacks.set(id, callback); return id; },
      unregisterCallback(id) { callbacks.delete(id); },
      invoke: async (command, args = {}) => {
        if (command === 'plugin:event|listen') { const id = next++; listeners.set(id, args); return id; }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (command === 'discover_esp') return [];
        if (command === 'load_secret') return args.key === 'github_access_token' ? 'mock-not-a-token' : null;
        if (command === 'target_registry_load') return JSON.parse(localStorage.getItem('mock.target-registry') || '{}');
        if (command === 'target_registry_save') {
          const records = JSON.parse(localStorage.getItem('mock.target-registry') || '{}');
          if (args.overwrite || !records[args.uid]) records[args.uid] = { uid: args.uid, label: args.label, model: args.model };
          localStorage.setItem('mock.target-registry', JSON.stringify(records));
          return records;
        }
        if (command === 'esp_http') {
          window.requests.push(args.path);
          return JSON.stringify(args.path === '/ping' ? { status: 'ok' }
            : args.path === '/api/programmer/status' ? { statusEventsAvailable: true, chipModel: 'ESP32-S3', swclkPin: 4, swdioPin: 5 }
              : args.path === '/api/wifi/status' ? { connected: true, ssid: 'Atölye', ip: '192.168.1.3', rssi: -37 } : {});
        }
        if (command === 'esp_watch') {
          window.watchStarts++; window.lastWatch = args.watchId;
          return new Promise(resolve => watches.set(args.watchId, resolve));
        }
        if (command === 'esp_watch_stop') { window.watchStops++; watches.get(args.watchId)?.(); watches.delete(args.watchId); return; }
        if (command === 'esp_stream') return new Promise(resolve => { window.finishStream = () => resolve(JSON.stringify({ done: true, programmedBytes: 4096, freeBytes: 520192, durationMs: 1000 })); });
        return null;
      },
    };
  });
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'ui-test' }) }));
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.waitForFunction(() => window.watchStarts >= 1);
  await page.getByRole('button', { name: /@ui-test ile devam et/ }).click();
  await page.locator('[data-rail-tool="devices"]:visible').click();
  const stm = page.locator('.device-target:visible');
  const esp = page.locator('.device-programmer:visible');
  await stm.getByText('Hedef bekleniyor', { exact: true }).waitFor();
  const attached = { status: 'online', wifi: { connected: true, ssid: 'Atölye', ip: '192.168.1.3' },
    target: { connected: true, uid: '001300155231501920323239', model: 'STM32F446', label: 'Aviyonik kart', flashSizeKb: 512 } };
  await page.evaluate(data => window.emitStatus(data, 'different-watch'), attached);
  assert.equal(await stm.getByText('Hedef bekleniyor', { exact: true }).count(), 1);
  await page.evaluate(data => window.emitStatus(data), attached);
  await stm.getByText('Bağlı', { exact: true }).waitFor();
  await stm.getByRole('textbox', { name: 'Kart adı', exact: true }).fill('Telemetri kartı');
  await stm.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mock.target-registry') || '{}')['001300155231501920323239']?.label === 'Telemetri kartı');
  await stm.locator('.device-hero > span').filter({ hasText: 'Telemetri kartı' }).waitFor();
  const starts = await page.evaluate(() => window.watchStarts);
  const stops = await page.evaluate(() => window.watchStops);
  const suspendedWatch = await page.evaluate(() => window.lastWatch);
  await stm.getByRole('button', { name: "FLASH'I ANALİZ ET", exact: true }).click();
  await page.waitForFunction(previous => window.watchStops > previous && typeof window.finishStream === 'function', stops);
  await page.evaluate(id => window.emitStatus({ status: 'offline' }, id), suspendedWatch);
  assert.equal(await esp.getByText('Bağlı', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.watchStarts), starts);
  await page.evaluate(() => window.finishStream());
  await page.waitForFunction(previous => window.watchStarts > previous, starts);
  await page.evaluate(data => window.emitStatus(data), attached);
  assert.ok(await stm.getByText('Telemetri kartı', { exact: true }).count());
  await page.evaluate(() => window.emitStatus({ status: 'online', target: { connected: false } }));
  await stm.getByText('Hedef bekleniyor', { exact: true }).waitFor();
  await page.evaluate(data => window.emitStatus(data), attached);
  await stm.getByText('Bağlı', { exact: true }).waitFor();
  // More than the old HTTP polling interval: live events need no periodic requests.
  const requests = await page.evaluate(() => window.requests.slice());
  await page.waitForTimeout(11000);
  assert.deepEqual(await page.evaluate(() => window.requests), requests);
  assert.ok(!requests.includes('/api/target/status'));
  assert.ok(!requests.includes('/api/target/label'));
  const oldWatch = await page.evaluate(() => window.lastWatch);
  const beforeDisconnect = await page.evaluate(() => ({ starts: window.watchStarts, stops: window.watchStops }));
  await page.evaluate(() => window.emitStatus({ status: 'offline' }));
  await esp.getByText('Çevrimdışı', { exact: true }).waitFor();
  await stm.getByText('Hedef bekleniyor', { exact: true }).waitFor();
  await page.waitForFunction(previous => window.watchStops > previous, beforeDisconnect.stops);
  await page.evaluate(({ data, id }) => window.emitStatus(data, id), { data: attached, id: oldWatch });
  assert.equal(await esp.getByText('Çevrimdışı', { exact: true }).count(), 1);
  await page.waitForFunction(previous => window.watchStarts > previous, beforeDisconnect.starts, { timeout: 25000 });
  await page.evaluate(data => window.emitStatus(data), attached);
  await esp.getByText('Bağlı', { exact: true }).waitFor();
  await stm.getByText('Bağlı', { exact: true }).waitFor();
  assert.ok(await stm.getByText('Telemetri kartı', { exact: true }).count());
  // A different ESP and an unnamed firmware target still recover the saved UID name.
  await page.evaluate(() => localStorage.setItem('stardrop.bridge', 'http://192.168.1.9'));
  await page.reload();
  await page.waitForFunction(() => window.watchStarts >= 1);
  await page.getByRole('button', { name: /@ui-test ile devam et/ }).click();
  await page.locator('[data-rail-tool="devices"]:visible').click();
  await page.evaluate(data => window.emitStatus(data), { ...attached, target: { ...attached.target, label: '' } });
  await stm.locator('.device-hero > span').filter({ hasText: 'Telemetri kartı' }).waitFor();
  await page.evaluate(data => window.emitStatus(data), { ...attached, target: { ...attached.target, uid: '001300155231501920323240', label: '' } });
  await stm.getByRole('textbox', { name: 'Kart adı', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.device-target input[aria-label="Kart adı"]')?.value === '');
  assert.deepEqual(errors, []);
  console.log('Connection events and local UID names survive unplug, restart and ESP changes; no target polling or remote rename requests.');
} finally { await browser.close(); }
