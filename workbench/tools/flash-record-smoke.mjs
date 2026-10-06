import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const uid = '001300155231501920323239';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const mount = async () => {
    await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
    await page.evaluate(async uid => {
      let listener, nextId = 1;
      const callbacks = new Map();
      const read = () => JSON.parse(localStorage.getItem('flash-record-smoke') || '{}');
      window.scanFailure = false; window.changeDuringScan = false;
      window.currentUid = uid;
      window.__TAURI_INTERNALS__ = {
        transformCallback(callback) { const id = nextId++; callbacks.set(id, callback); return id; },
        unregisterCallback(id) { callbacks.delete(id); },
        invoke: async (command, args = {}) => {
          if (command === 'plugin:event|listen') { listener = args.handler; return 1; }
          if (command === 'plugin:event|unlisten') return;
          if (command === 'target_registry_load') return read();
          if (command === 'target_registry_save' || command === 'target_registry_analysis_save') {
            const records = read(); const now = Date.now();
            const record = records[args.uid] || { uid: args.uid, label: '', model: args.model, createdAt: now };
            if (command === 'target_registry_save') record.label = args.label;
            else record.flashAnalysis = { ...args.analysis, analyzedAt: now };
            records[args.uid] = { ...record, updatedAt: now };
            localStorage.setItem('flash-record-smoke', JSON.stringify(records));
            return records;
          }
          if (command === 'esp_http') return JSON.stringify(args.path === '/api/target/status'
            ? { connected: true, uid: window.currentUid } : {});
          if (command === 'esp_stream') {
            if (window.scanFailure) throw new Error('SWD okuma hatası');
            callbacks.get(listener)({ payload: { streamId: args.streamId, data: JSON.stringify({ pct: 50 }) } });
            if (window.changeDuringScan) window.currentUid = '001300155231501920323240';
            return JSON.stringify({ done: true, totalBytes: 524288, programmedBytes: 4096, freeBytes: 520192, durationMs: 2500 });
          }
          if (command === 'discover_esp') return [];
          return null;
        },
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      const [{ default: React }, { default: ReactDOM }, { default: EspConsole }, { default: useRegistry }, { namedTarget }, { createHardwareGate }] = await Promise.all([
        import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
        import('/src/EspConsole.jsx'), import('/src/useTargetRegistry.js'), import('/src/lib/targetRegistry.js'), import('/src/lib/hardwareGate.js'),
      ]);
      document.getElementById('root').style.display = 'none';
      const root = document.createElement('div'); root.className = 'app-shell'; document.body.append(root);
      const hardware = createHardwareGate();
      function Harness() {
        const [raw, setRaw] = React.useState({ connected: true, uid, model: 'STM32F446', flashSizeKb: 512 });
        const [notice, setNotice] = React.useState('');
        const registry = useRegistry(raw, setNotice);
        window.swapCard = next => setRaw(previous => ({ ...previous, uid: next }));
        return React.createElement(EspConsole, { devicesOnly: true, documentId: 'record-test', hardware,
          esp: { status: 'online' }, espBase: 'http://192.168.1.3', bridge: 'http://192.168.1.3',
          target: namedTarget(raw, registry.records), saveTargetName: registry.saveTargetName, saveTargetAnalysis: registry.saveTargetAnalysis,
          notice, setNotice, refreshTarget: async () => {}, flashLog: [], devices: [] });
      }
      ReactDOM.createRoot(root).render(React.createElement(Harness));
    }, uid);
  };
  await mount();
  await page.getByRole('button', { name: "FLASH'I ANALİZ ET" }).click();
  await page.getByText(/Son analiz ·/).waitFor();
  assert.match(await page.locator('.flash-record-meta').innerText(), /Yerel kayıt · canlı ölçüm değil/);
  assert.equal(await page.locator('.flash-summary strong').innerText(), '0.8%');
  await page.getByRole('textbox', { name: 'Kart adı' }).fill('Telemetri');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForFunction(uid => JSON.parse(localStorage.getItem('flash-record-smoke'))[uid]?.label === 'Telemetri', uid);
  assert.match(await page.locator('.device-target:visible .device-hero').innerText(), /Telemetri/);
  const saved = await page.evaluate(uid => JSON.parse(localStorage.getItem('flash-record-smoke'))[uid], uid);
  await mount();
  await page.getByText(/Son analiz ·/).waitFor();
  assert.equal(await page.locator('.flash-summary strong').innerText(), '0.8%');
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'Telemetri');
  await page.evaluate(() => { window.scanFailure = true; });
  await page.getByRole('button', { name: "FLASH'I ANALİZ ET" }).click();
  await page.getByText(/Flash analizi başarısız/).first().waitFor();
  assert.equal(await page.locator('.flash-summary strong').innerText(), '0.8%');
  await page.evaluate(() => { window.scanFailure = false; window.changeDuringScan = true; });
  await page.getByRole('button', { name: "FLASH'I ANALİZ ET" }).click();
  await page.getByText(/Hedef değişti/).first().waitFor();
  assert.equal(await page.evaluate(uid => JSON.parse(localStorage.getItem('flash-record-smoke'))[uid].flashAnalysis.analyzedAt, uid), saved.flashAnalysis.analyzedAt);
  await page.evaluate(() => window.swapCard('001300155231501920323240'));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.flash-record-meta').count(), 0);
  await page.evaluate(uid => window.swapCard(uid), uid);
  await page.getByText(/Son analiz ·/).waitFor();
  assert.equal(await page.locator('.flash-summary strong').innerText(), '0.8%');
  assert.deepEqual(errors, []);
  console.log('Flash history survives reload/rename; failed scans and UID changes cannot overwrite it. No hardware used.');
} finally { await browser.close(); }
