// Optional browser regression check: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/workspace-smoke.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const secrets = new Map();
  window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' } }, invoke: async (command, args = {}) => {
    if (command === 'github_device_start') return JSON.stringify({ user_code: 'MOCK-CODE', device_code: 'mock', expires_in: 900, interval: 5 });
    if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock-only-not-a-real-token' });
    if (command === 'load_secret') return secrets.get(args.key) || null;
    if (command === 'save_secret') { secrets.set(args.key, args.value); return 'memory'; }
    if (command === 'delete_secret') { secrets.delete(args.key); return null; }
    if (command === 'discover_esp') return [];
    if (command === 'esp_http') {
      if (!window.__mockOnline) throw new Error('Mock ESP çevrimdışı');
      if (args.path === '/ping') return JSON.stringify({ status: 'ok' });
      if (args.path === '/api/wifi/status') return JSON.stringify({ connected: true, ssid: 'MOCK', rssi: -42, saved: ['MOCK'] });
      if (args.path === '/api/target/status') return JSON.stringify({ connected: true, uid: window.__mockUid || 'test-uid', label: 'Mock kart', model: 'STM32F401CDU6', flashSizeKb: 384 });
      return JSON.stringify({});
    }
    if (command === 'esp_upload') {
      window.__mockUploadCount = (window.__mockUploadCount || 0) + 1;
      return new Promise((resolve, reject) => { window.__finishMockUpload = () => reject(new Error('Mock aktarım tamamlandı')); });
    }
    if (command === 'code_repo_status') return { warning: '', activeSha: null, latestSha: null };
    return null;
  } };
});
await page.route('https://api.github.com/**', route => route.fulfill({ status: route.request().url().endsWith('/user') ? 200 : 404,
  contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/user') ? { login: 'ui-test' } : { message: 'Mock repository unavailable' }) }));
const drag = async (from, to, checkPreview = false) => {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  if (checkPreview) {
    assert.equal(await page.locator('.workspace-drag-preview').count(), 1);
    assert.equal(await page.locator('.workspace-drag-preview').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  }
  await page.mouse.up();
};
try {
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  const welcomeSidebar = await page.locator('.welcome-sidebar:visible').boundingBox();
  await page.mouse.move(80, 400); await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.equal((await page.locator('.welcome-sidebar:visible').boundingBox()).y, welcomeSidebar.y);
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.getByRole('dialog', { name: 'Girişi doğrula' }).waitFor();
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).waitFor({ timeout: 12000 });
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).click();
  await page.getByRole('textbox', { name: 'Kart adı' }).fill('İlk kart');
  const firstTabId = await page.getByRole('tab', { name: 'Yeni Test', exact: true }).getAttribute('data-tab-id');
  await page.getByRole('button', { name: 'Yeni sekme aç' }).click();
  assert.equal(await page.locator('.workspace-empty:visible .start-wordmark').innerText(), 'STARDROP');
  assert.equal(await page.locator('.workspace-empty:visible .welcome-actions button').count(), 2);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.start-wordmark:visible').evaluate(el => getComputedStyle(el).fontFamily), 'Michroma, sans-serif');
  assert.ok(await page.locator('.welcome-actions:visible small').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 11));
  assert.equal(await page.locator('.brand-mark:visible').count(), 0);
  assert.equal(await page.evaluate(() => document.fonts.check('16px Michroma')), true);
  await drag(page.locator('[data-rail-tool="workbench"]:visible'), page.locator('.workspace-empty:visible'), true);
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).click();
  await page.getByRole('textbox', { name: 'Kart adı' }).fill('İkinci kart');
  const secondTabId = await page.locator('[role=tab][aria-selected=true]:visible').getAttribute('data-tab-id');
  assert.notEqual(firstTabId, secondTabId);
  await page.locator(`[data-tab-id="${firstTabId}"]`).click();
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'İlk kart');
  await page.locator(`[data-tab-id="${secondTabId}"]`).click();
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'İkinci kart');
  await drag(page.locator('[data-rail-tool="settings"]:visible'), page.locator('.workspace-panel:visible'), true);
  await page.getByRole('heading', { name: 'GITHUB TEST DEPOSU' }).waitFor();
  await page.locator('.notification-details:visible summary').click();
  await page.locator('.notification-history-floating').waitFor();
  assert.equal(await page.locator('.notification-history-floating').evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.right - 8, r.top + 20)?.closest('.notification-history-floating') === el;
  }), true);
  assert.equal(await page.locator('.notification-history-floating').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  await page.getByRole('heading', { name: 'Bildirimler', exact: true }).click();
  assert.equal(await page.locator('.notification-details:visible').evaluate(el => el.open), true);
  await page.getByRole('button', { name: /Son taslağı geri aç/ }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'İkinci kart');
  await page.getByRole('button', { name: 'Yeni Test sekmesini kapat' }).last().click();
  await page.locator('.notification-details:visible summary').click();
  await page.getByRole('button', { name: /Son taslağı geri aç/ }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'İkinci kart');
  await drag(page.locator('[role=tab][aria-selected=true]:visible'), page.getByRole('tab', { name: 'Hızlı Yükleme', exact: true }), true);
  assert.equal(await page.getByRole('tab').first().innerText(), 'Yeni Test');
  // Escape while held cancels a tool replacement without its click opening a tab.
  const before = await page.getByRole('tab').count();
  const rail = await page.locator('[data-rail-tool="library"]:visible').boundingBox();
  const panel = await page.locator('.workspace-panel:visible').boundingBox();
  await page.mouse.move(rail.x + 30, rail.y + 20); await page.mouse.down();
  await page.mouse.move(panel.x + 180, panel.y + 180, { steps: 8 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.equal(await page.getByRole('tab').count(), before);
  assert.equal(await page.locator('.workspace-drag-preview').count(), 0);
  // Welcome round-trip keeps the exact wizard state mounted.
  await page.getByRole('button', { name: 'Girişe dön', exact: true }).click();
  await page.getByRole('button', { name: /@ui-test ile devam et/ }).click();
  await page.locator(`[data-tab-id="${firstTabId}"]`).click();
  assert.equal(await page.getByRole('textbox', { name: 'Kart adı' }).inputValue(), 'İlk kart');
  await page.locator('.notification-details:visible summary').click();
  await page.getByRole('heading', { name: 'Hangi STM32?' }).click();
  assert.equal(await page.locator('.notification-details:visible').evaluate(el => el.open), false);
  await page.getByRole('combobox', { name: 'STM32 modeli' }).click();
  assert.equal(await page.getByRole('listbox').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/stardrop-workspace.png' });
  while (await page.getByRole('button', { name: /sekmesini kapat/ }).count()) await page.getByRole('button', { name: /sekmesini kapat/ }).first().click();
  assert.equal(await page.getByRole('tab').count(), 0);
  assert.equal(await page.locator('.start-wordmark:visible').innerText(), 'STARDROP');
  await page.locator('[data-rail-tool="settings"]:visible').click();
  const fixedRail = await page.locator('.rail:visible').boundingBox();
  const fixedTabs = await page.locator('.workspace-tabbar:visible').boundingBox();
  await page.setViewportSize({ width: 1440, height: 600 });
  const smallRail = await page.locator('.rail:visible').boundingBox();
  const smallTabs = await page.locator('.workspace-tabbar:visible').boundingBox();
  await page.locator('.workspace-panel:visible').evaluate(el => { const filler = document.createElement('div'); filler.dataset.scrollTest = 'true'; filler.style.height = '1200px'; el.append(filler); });
  await page.mouse.move(1100, 400); await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(150);
  assert.ok(await page.locator('.workspace-panel:visible').evaluate(el => el.scrollTop > 0));
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.equal((await page.locator('.rail:visible').boundingBox()).y, smallRail.y);
  assert.equal((await page.locator('.workspace-tabbar:visible').boundingBox()).y, smallTabs.y);
  await page.mouse.move(60, 400); await page.mouse.wheel(0, -1800);
  await page.waitForTimeout(100);
  assert.equal((await page.locator('.rail:visible').boundingBox()).y, smallRail.y);
  await page.locator('[data-scroll-test]').evaluate(el => el.remove());
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal((await page.locator('.rail:visible').boundingBox()).y, fixedRail.y);
  assert.equal((await page.locator('.workspace-tabbar:visible').boundingBox()).y, fixedTabs.y);
  // No real hardware: hold a mocked upload to exercise inter-tab exclusion.
  await page.evaluate(() => { window.__mockOnline = true; });
  await page.locator('.connection-status:visible').click();
  await page.locator('[data-rail-tool="flash"]:visible').click();
  await page.getByRole('button', { name: /Mock kart/ }).waitFor();
  await page.locator('.workspace-panel:visible input[type=file]').setInputFiles({ name: 'first.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(32, 1) });
  const flashTabId = await page.locator('[role=tab][aria-selected=true]:visible').getAttribute('data-tab-id');
  await page.getByRole('button', { name: 'YAZILIMI YÜKLE (SWD)', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__finishMockUpload));
  assert.equal(await page.getByRole('button', { name: 'Hızlı Yükleme sekmesini kapat' }).isDisabled(), true);
  await drag(page.locator('[data-rail-tool="settings"]:visible'), page.locator('.workspace-panel:visible'), true);
  assert.equal(await page.locator('[role=tab][aria-selected=true]:visible').getAttribute('data-tab-id'), flashTabId);
  await page.getByRole('button', { name: 'Yeni sekme aç' }).click();
  await drag(page.locator('[data-rail-tool="flash"]:visible'), page.locator('.workspace-empty:visible'));
  await page.locator('.workspace-panel:visible input[type=file]').setInputFiles({ name: 'second.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(48, 2) });
  assert.equal(await page.locator('.flash-submit:visible').isDisabled(), true);
  assert.equal(await page.locator('.flash-terminal:visible').innerText(), '[STARDROP] YRT Aviyonik SWD İstasyonu Hazır. Yazılım bekleniyor...');
  assert.equal(await page.locator('.flash-feedback:visible').count(), 0);
  await page.evaluate(() => window.__finishMockUpload());
  await page.waitForFunction(() => !document.querySelector('.session-view:not([hidden]) .workspace-panel:not([hidden]) .flash-submit').disabled);
  assert.equal(await page.locator('.firmware-file-card:visible').innerText(), 'second.bin\nRAW BIN\n0.0 KB');
  await page.locator(`[data-tab-id="${flashTabId}"]`).click();
  assert.match(await page.locator('.firmware-file-card:visible').innerText(), /first.bin/);
  assert.match(await page.locator('.flash-terminal:visible').innerText(), /Mock aktarım tamamlandı/);
  // A target swap after preparation must never upload the selected bytes.
  await page.evaluate(() => { window.__mockUid = 'another-target'; });
  await page.getByRole('button', { name: 'YAZILIMI YÜKLE (SWD)', exact: true }).click();
  await page.locator('.flash-terminal:visible').getByText(/STM32 hedefi değişti/).waitFor();
  assert.equal(await page.evaluate(() => window.__mockUploadCount), 1);
  assert.deepEqual(errors, []);
  console.log('Workspace smoke passed: isolated forms/files/results, drop/replace/recovery, reorder, Escape, welcome retention, Michroma, hardware lock and UID guard.');
} finally { await browser.close(); }
