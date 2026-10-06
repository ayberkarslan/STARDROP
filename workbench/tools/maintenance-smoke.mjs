import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.evaluate(async () => {
    const callbacks = new Map(); let nextId = 1; let handler;
    window.eraseRequests = 0;
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { const id = nextId++; callbacks.set(id, callback); return id; },
      unregisterCallback(id) { callbacks.delete(id); },
      invoke: async (command, args) => {
        if (command === 'plugin:event|listen') { handler = args.handler; return 1; }
        if (command === 'plugin:event|unlisten') return;
        if (command === 'esp_http') return JSON.stringify(args.path === '/api/programmer/status'
          ? { maintenanceAvailable: true, maintenanceStreamAvailable: true, swdioPin: 5, swclkPin: 4, resetAvailable: true, resetPin: 6 } : args.path === '/api/target/status'
            ? { connected: true, uid: 'mock-uid' } : {});
        if (command === 'esp_stream') {
          if (args.method !== 'POST' || JSON.parse(args.body).confirmation !== 'FLASH SIL') throw new Error('Invalid erase request');
          window.eraseRequests++;
          for (const data of [{ stage: 'erasing', pct: 25, overallPct: 17 }, { stage: 'verifying', pct: 50, overallPct: 85 }, { done: true, pct: 100, overallPct: 100, elapsedMs: 3000 }]) {
            callbacks.get(handler)({ payload: { streamId: args.streamId, data: JSON.stringify(data) } });
            await new Promise(resolve => setTimeout(resolve, 600));
          }
          return JSON.stringify({ done: true, pct: 100 });
        }
        return null;
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    const [{ default: React }, { default: ReactDOM }, { default: EspConsole }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'), import('/src/EspConsole.jsx'),
    ]);
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); host.className = 'app-shell';
    host.style.cssText = 'display:block;width:100vw;height:100vh;overflow:auto'; document.body.append(host);
    ReactDOM.createRoot(host).render(React.createElement(EspConsole, {
      devicesOnly: true, esp: { status: 'online' }, bridge: 'http://192.168.1.3', espBase: 'http://192.168.1.3',
      target: { connected: true, uid: 'mock-uid', model: 'STM32F446RET6' },
      hardware: { run: async (_, __, task) => task() }, documentId: 'mock', setNotice() {}, refreshTarget: async () => {},
    }));
  });
  await page.locator('.device-programmer img').waitFor();
  await page.waitForFunction(() => document.querySelector('.device-programmer img')?.naturalWidth > 0);
  const programmerBounds = await page.locator('.device-programmer').boundingBox();
  const targetBounds = await page.locator('.device-target').boundingBox();
  assert.ok(programmerBounds.x + programmerBounds.width < targetBounds.x);
  assert.equal(await page.getByRole('button', { name: 'ESP ayarları', exact: true }).count(), 1);
  await page.screenshot({ path: '/tmp/stardrop-devices.png' });
  await page.getByRole('button', { name: 'SWD bağlantı rehberini aç' }).click();
  const guide = page.getByRole('dialog', { name: 'SWD bağlantı rehberi' });
  await guide.waitFor();
  assert.match(await page.getByRole('combobox', { name: 'Rehber hedef kartı' }).innerText(), /Nucleo F446RE/);
  assert.equal(await guide.locator('.wiring-pinout img').isVisible(), false);
  await page.getByRole('combobox', { name: 'Rehber hedef kartı' }).click();
  await page.getByRole('option', { name: 'Nucleo F446RE · MB1136' }).click();
  assert.equal(await guide.getByText('GPIO 5', { exact: true }).count(), 1);
  assert.equal(await guide.getByText('CN7 · 13', { exact: true }).count(), 1);
  assert.equal(await guide.getByText('CN7 · 15', { exact: true }).count(), 1);
  assert.equal(await guide.getByText('GPIO 6', { exact: true }).count(), 1);
  await page.screenshot({ path: '/tmp/stardrop-wiring-guide.png' });
  await guide.locator('.wiring-pinout summary').click();
  await page.waitForFunction(() => document.querySelector('.wiring-pinout img')?.naturalWidth > 0);
  assert.equal(await guide.locator('.wiring-pinout img').isVisible(), true);
  await guide.getByRole('button', { name: 'Büyük göster' }).click();
  await page.getByRole('dialog', { name: 'Nucleo F446RE pinout' }).waitFor();
  await page.getByRole('button', { name: 'Rehbere dön' }).click();
  await guide.waitFor();
  assert.equal(await guide.locator('.wiring-pinout img').isVisible(), false);
  await page.mouse.click(5, 5);
  assert.equal(await guide.count(), 0);
  await page.locator('.device-maintenance summary').click();
  await page.getByRole('button', { name: 'Flash’ı sil', exact: true }).click();
  assert.equal(await page.getByText('Onay için FLASH SIL yaz').count(), 0);
  await page.getByRole('button', { name: 'Devam et', exact: true }).click();
  await page.getByRole('heading', { name: 'Emin misin?' }).waitFor();
  assert.equal(await page.evaluate(() => window.eraseRequests), 0);
  await page.getByRole('button', { name: 'Evet, flash’ı sil' }).click();
  await page.getByText('Siliniyor · %25', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kapat', exact: true }).isEnabled(), false);
  await page.getByText('Silindi · %100 — Doğrulanıyor · %50', { exact: true }).waitFor();
  await page.getByText('Silme ve doğrulama tamamlandı · %100', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.eraseRequests), 1);
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: 'STM32 bakım onayı' }).count(), 0);
  await page.setViewportSize({ width: 900, height: 900 });
  const narrowEsp = await page.locator('.device-programmer').boundingBox();
  const narrowStm = await page.locator('.device-target').boundingBox();
  assert.ok(narrowEsp.y + narrowEsp.height <= narrowStm.y);
  assert.equal(await page.getByRole('button', { name: 'FLASH\'I ANALİZ ET', exact: true }).count(), 1);
  console.log('Two-step erase confirmation and live progress passed; no real device used.');
} finally { await browser.close(); }
