import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.evaluate(async () => {
    const callbacks = new Map(), listeners = new Map(); let next = 1;
    window.uploads = 0; window.failNext = false; window.wrongUid = false;
    const target = { connected: true, uid: '001300155231501920323239', model: 'STM32F446', label: 'Telemetri kartı', flashSizeKb: 512 };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) { const id = next++; callbacks.set(id, callback); return id; },
      unregisterCallback(id) { callbacks.delete(id); },
      invoke: async (command, args) => {
        if (command === 'plugin:event|listen') { const id = next++; listeners.set(id, args); return id; }
        if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (command === 'esp_http') return JSON.stringify(args.path === '/api/target/status' ? { ...target, uid: window.wrongUid ? 'different-uid' : target.uid } : { chipModel: 'ESP32-S3' });
        if (command === 'esp_upload') { window.uploads++; await new Promise(resolve => setTimeout(resolve, 1000)); return; }
        if (command === 'esp_stream') {
          const emit = data => { for (const { event, handler } of listeners.values()) if (event === 'stardrop-esp-stream') callbacks.get(handler)?.({ payload: { streamId: args.streamId, data: JSON.stringify(data) } }); };
          for (const pct of [23, 68]) { emit({ pct, msg: `Yazıldı ve doğrulandı: %${pct}`, type: 'chunk' }); await new Promise(resolve => setTimeout(resolve, 700)); }
          if (window.failNext) throw 'SWD yazma hatası: ACK 2; blok 14 geri okuma doğrulanamadı.';
          emit({ pct: 99, msg: 'STM32 başlatılıyor' }); await new Promise(resolve => setTimeout(resolve, 400));
          emit({ pct: 100, done: true, msg: 'Yükleme tamamlandı', type: 'success' });
          return JSON.stringify({ done: true });
        }
        return null;
      },
    };
    const [{ default: React }, { default: ReactDOM }, { default: FlashSession }, { createHardwareGate }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'), import('/src/FlashSession.jsx'), import('/src/lib/hardwareGate.js'),
    ]);
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); host.className = 'app-shell'; host.style.cssText = 'display:block;width:100vw;height:100vh;overflow:auto'; document.body.append(host);
    function Harness() {
      const [hardwareBusy, setBusy] = React.useState(null);
      const gate = React.useRef(null); if (!gate.current) gate.current = createHardwareGate(setBusy);
      return React.createElement(FlashSession, { documentId: 'mock-upload', services: { esp: { status: 'online' }, target,
        bridge: 'http://192.168.1.3', activeBridge: 'http://192.168.1.3', espBase: 'http://192.168.1.3', devices: [],
        hardware: gate.current, hardwareBusy, setNotice() {}, refreshTarget() {}, refreshTargetAt: async () => {}, onDiscover() {} } });
    }
    ReactDOM.createRoot(host).render(React.createElement(Harness));
  });
  await page.getByRole('heading', { name: 'Firmware yükle' }).waitFor();
  const bounds = await page.locator('.flash-station').boundingBox();
  assert.ok(bounds.width >= 1400);
  assert.equal(await page.locator('.flash-station').evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  assert.equal(await page.locator('.flash-station').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  const controls = await page.locator('.flash-controls').boundingBox(), runtime = await page.locator('.flash-runtime').boundingBox();
  assert.ok(controls.x + controls.width < runtime.x);
  const upload = page.getByRole('button', { name: 'YAZILIMI YÜKLE (SWD)', exact: true });
  assert.equal(await upload.isEnabled(), false);
  await page.getByLabel('Firmware dosyası', { exact: true }).setInputFiles({ name: 'blink.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(512) });
  await page.screenshot({ path: '/tmp/stardrop-flash-ready.png' });
  await upload.click();
  await page.getByText('ESP32’ye aktarılıyor', { exact: true }).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: 'STM32 yükleme ilerlemesi' }).getAttribute('aria-valuenow'), null);
  assert.equal(await page.getByLabel('Firmware dosyası', { exact: true }).isEnabled(), false);
  await page.locator('.flash-progress-heading').getByText('68%', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/stardrop-flash-progress.png' });
  await page.getByText('Yükleme doğrulandı', { exact: true }).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: 'STM32 yükleme ilerlemesi' }).getAttribute('aria-valuenow'), '100');
  assert.equal(await page.evaluate(() => window.uploads), 1);
  await page.evaluate(() => { window.failNext = true; });
  await upload.click();
  await page.getByText('Yükleme tamamlanamadı', { exact: true }).waitFor();
  await page.locator('.flash-failure').getByText('SWD yazma hatası: ACK 2; blok 14 geri okuma doğrulanamadı.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Yükleme doğrulandı', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('progressbar', { name: 'STM32 yükleme ilerlemesi' }).getAttribute('aria-valuenow'), '68');
  await page.screenshot({ path: '/tmp/stardrop-flash-failure.png' });
  await page.evaluate(() => { window.wrongUid = true; });
  await upload.click();
  await page.locator('.flash-failure').getByText('STM32’ye yazma başlatılmadı.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.uploads), 2);
  await page.setViewportSize({ width: 960, height: 900 });
  const narrowControls = await page.locator('.flash-controls').boundingBox(), narrowRuntime = await page.locator('.flash-runtime').boundingBox();
  assert.ok(narrowControls.y + narrowControls.height <= narrowRuntime.y);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(errors, []);
  console.log('Full-width upload, real phases/progress, native error detail, UID guard and responsive layout passed; no hardware used.');
} finally { await browser.close(); }
