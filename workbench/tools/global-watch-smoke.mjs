import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const secrets = new Map(), uid = '001300155231501920323239', hash = 'f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b';
    let counter = 10;
    localStorage.setItem('stardrop.bridge', 'http://192.168.1.3');
    window.watchMock = { calls: 0, mismatch: false, confirmed: false, exports: [], failFlash: false, flashes: 0 };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
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
        if (command === 'esp_stream') { window.watchMock.flashes++; await new Promise(resolve => setTimeout(resolve, 200)); if (!window.watchMock.failFlash) window.watchMock.mismatch = false; return JSON.stringify(window.watchMock.failFlash ? { error: true, msg: 'Mock yükleme hatası' } : { done: true, pct: 100 }); }
        if (command === 'inspect_watch_elf') return { variables, imageSha256: hash, imageSize: 64 };
        if (command === 'telemetry_export_csv') { window.watchMock.exports.push(args.csv); return '/tmp/watch-mock.csv'; }
        if (command === 'esp_http') {
          if (args.path === '/ping') return JSON.stringify({ status: 'ok' });
          if (args.path === '/api/wifi/status') return JSON.stringify({ connected: true, ssid: 'Mock', ip: '192.168.1.3', rssi: -40 });
          if (args.path === '/api/programmer/status') return JSON.stringify({ watchAvailable: true, telemetryAvailable: true });
          if (args.path === '/api/target/status') return JSON.stringify({ connected: true, uid, label: 'Atölye kartı', model: 'STM32F446', flashSizeKb: 512 });
          if (args.path === '/api/watch/verify') return JSON.stringify(window.watchMock.mismatch ? { valid: false, reason: 'ELF_FIRMWARE_MISMATCH', mismatchConfirmed: window.watchMock.confirmed, uid, sha256: hash } : { valid: true, uid, sha256: hash, session: 'session' });
          if (args.path === '/api/watch/read') {
            window.watchMock.calls++;
            const value = (++counter).toString(16).padStart(8, '0').match(/../g).reverse().join('');
            const requested = JSON.parse(args.body).addresses.split(',').map(item => Number(item.split(':')[0]));
            return JSON.stringify({ valid: true, uid, sha256: hash, session: 'session', values: requested.map(address => ({ address, hex: address === variables[0].address ? value : '0000c841', stable: true })) });
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
  // A minimal ELF image exercises the real upload conversion; transport stays mocked.
  const image = Buffer.alloc(160);
  image.set([0x7f, 0x45, 0x4c, 0x46, 1, 1]); image.writeUInt16LE(40, 18);
  image.writeUInt32LE(52, 28); image.writeUInt16LE(32, 42); image.writeUInt16LE(1, 44);
  image.writeUInt32LE(1, 52); image.writeUInt32LE(96, 56); image.writeUInt32LE(0x08000000, 64); image.writeUInt32LE(64, 68);
  // Selection alone must be enough: no flash button click before opening monitor.
  await page.locator('[data-rail-tool="flash"]:visible').click();
  await page.locator('.firmware-select:visible input').setInputFiles({ name: 'SELECTED.elf', mimeType: 'application/octet-stream', buffer: image });
  await page.locator('.workspace-tab').filter({ hasText: 'Canlı İzleme' }).click();
  await monitor.getByText('SELECTED.elf · Seçilen ELF · 2 değişken', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.watchMock.flashes), 0);
  const upload = async name => {
    await page.locator('[data-rail-tool="flash"]:visible').click();
    await page.locator('.firmware-select:visible input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: image });
    await page.getByRole('button', { name: 'YAZILIMI YÜKLE', exact: true }).click();
    await page.getByRole('button', { name: 'DEĞİŞKENLERİ İZLE →' }).waitFor();
    await page.locator('.workspace-tab').filter({ hasText: 'Canlı İzleme' }).click();
    await monitor.getByText(`${name} · Son yüklenen ELF · 2 değişken`, { exact: true }).waitFor();
  };
  await upload('RAMDENEME.elf');
  await monitor.getByLabel('İzleme ELF dosyası').setInputFiles({ name: 'EXTRA.elf', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) });
  await monitor.getByText('EXTRA.elf · 2 değişken', { exact: true }).waitFor();
  await page.locator('[data-rail-tool="devices"]:visible').click();
  await page.locator('.workspace-tab').filter({ hasText: 'Canlı İzleme' }).click();
  assert.equal(await monitor.getByText('EXTRA.elf · 2 değişken', { exact: true }).count(), 1);
  await monitor.getByRole('button', { name: 'HIZLI YÜKLEME ELF’İ', exact: true }).click();
  await monitor.getByText('RAMDENEME.elf · Son yüklenen ELF · 2 değişken', { exact: true }).waitFor();
  // Replacing firmware must also update an already populated monitor tab.
  await upload('RAMDENEME-v2.elf');
  await page.evaluate(() => { window.watchMock.mismatch = true; window.watchMock.confirmed = true; });
  await monitor.getByLabel('Global değişken ara').fill('unknown_variable');
  await monitor.getByLabel('Global değişken ara').press('Enter');
  await monitor.getByRole('alert').filter({ hasText: 'bulunamadı' }).waitFor();
  assert.equal(await page.evaluate(() => window.watchMock.flashes), 2);
  await monitor.getByLabel('Global değişken ara').fill('watch_random');
  await monitor.getByLabel('Global değişken ara').press('Enter');
  await page.waitForFunction(() => window.watchMock.calls >= 3);
  assert.equal(await page.evaluate(() => window.watchMock.flashes), 3);
  await page.evaluate(() => { window.watchMock.confirmed = false; });
  assert.equal(await monitor.locator('.live-channel h2').innerText(), 'watch_random');
  assert.match(await monitor.locator('.live-value strong').innerText(), /^\d+$/);
  assert.equal(await monitor.getByText('CANLI', { exact: true }).count(), 1);
  assert.equal(await monitor.getByRole('group', { name: 'Çalışılan kart' }).getByText('Atölye kartı', { exact: true }).count(), 1);
  assert.equal(await monitor.getByText('ELF farklıysa izlemeye başlamadan önce karta yüklenir.', { exact: true }).count(), 0);
  assert.equal(await monitor.getByText('Oturum bilgisi', { exact: true }).count(), 0);
  assert.equal(await monitor.getByRole('status').count(), 0);
  assert.equal(await monitor.getByRole('region', { name: 'İzlenen değişkenler' }).locator('.live-channel').count(), 1);
  assert.equal(await monitor.locator('.watch-chart path').count(), 1);
  await monitor.locator('.watch-graph summary').click();
  await monitor.locator('.watch-chart svg').waitFor({ state: 'visible' });
  await monitor.locator('.watch-graph summary').click();
  await monitor.getByLabel('Global değişken ara').fill('watch_random');
  await monitor.getByLabel('Global değişken ara').press('Enter');
  await monitor.getByRole('alert').filter({ hasText: 'zaten' }).waitFor();
  await monitor.getByLabel('Global değişken ara').fill('watch_temperature');
  await monitor.getByLabel('Global değişken ara').press('Enter');
  await monitor.locator('.live-channel').filter({ hasText: 'watch_temperature' }).locator('.live-value strong').filter({ hasText: '25' }).waitFor();
  assert.equal(await page.evaluate(() => window.watchMock.flashes), 3);
  await monitor.getByRole('button', { name: 'watch_temperature izlemeyi kaldır', exact: true }).click();
  assert.equal(await monitor.locator('.live-channel').count(), 1);
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
  await page.locator('.workspace-tab').filter({ hasText: 'Canlı İzleme' }).click();
  await monitor.locator('.watch-picker summary').click();
  await monitor.getByLabel('İzlenecek global değişken').waitFor({ state: 'visible' });
  await monitor.locator('.watch-picker summary').click();
  await page.screenshot({ path: '/tmp/stardrop-live-expressions.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Global watch: ELF aktarımı, Enter ile izleme, canlı liste düzenleme, grafik, CSV ve güvenli durdurma geçti');
} finally { await browser.close(); }
