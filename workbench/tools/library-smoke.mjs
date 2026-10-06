// UI_URL, PLAYWRIGHT_MODULE and CHROMIUM_PATH can point at a local development setup.
import assert from 'node:assert/strict';
import catalog from '../../code-repo/catalog/catalog.json' with { type: 'json' };
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const secrets = new Map();
    window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' } }, invoke: async (command, args = {}) => {
      if (command === 'github_device_start') return JSON.stringify({ user_code: 'MOCK', device_code: 'mock', expires_in: 900, interval: 5 });
      if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock-not-a-token' });
      if (command === 'load_secret') return secrets.get(args.key) || null;
      if (command === 'save_secret') { secrets.set(args.key, args.value); return 'memory'; }
      if (command === 'discover_esp') return [];
      if (command === 'esp_http') throw new Error('Mock ESP offline');
      if (command === 'code_repo_status') return { warning: '', activeSha: null, latestSha: 'mock-sha' };
      return null;
    } };
  });
  await page.route('https://api.github.com/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/user' ? { login: 'ui-test' }
      : path.endsWith('/contents/stardrop/catalog/catalog.json') ? { sha: 'mock', content: Buffer.from(JSON.stringify(catalog)).toString('base64') }
        : path.endsWith('/contents/stardrop/library') || path.endsWith('/contents/stardrop') ? []
          : { permissions: { push: true } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.locator('.welcome-screen:visible').waitFor();
  const sky = page.locator('.welcome-screen:visible .welcome-stars');
  assert.equal(await sky.getAttribute('aria-hidden'), 'true');
  assert.equal(await sky.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(await sky.locator('circle').count(), 210);
  assert.ok(await sky.locator('circle').evaluateAll(stars => stars.every(star => Number(star.getAttribute('r')) <= 1.05)));
  assert.deepEqual(await page.evaluate(() => {
    const surface = document.querySelector('.welcome-screen');
    const cancelled = (type, options) => !surface.dispatchEvent(new (type === 'keydown' ? KeyboardEvent : MouseEvent)(type, { bubbles: true, cancelable: true, ...options }));
    return [cancelled('contextmenu', {}), cancelled('keydown', { key: 'Tab' }), cancelled('keydown', { key: 'F12' }), cancelled('keydown', { key: 'I', ctrlKey: true, shiftKey: true }), cancelled('keydown', { key: 'a', ctrlKey: true }), cancelled('keydown', { key: 'a', metaKey: true })];
  }), [true, true, true, true, true, true]);
  const welcomeTitle = page.locator('.welcome-content h1');
  assert.equal(await welcomeTitle.evaluate(el => getComputedStyle(el).userSelect), 'none');
  const titleBounds = await welcomeTitle.boundingBox();
  await page.mouse.move(titleBounds.x + 3, titleBounds.y + titleBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBounds.x + titleBounds.width - 3, titleBounds.y + titleBounds.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.getSelection().toString()), '');
  for (const selector of ['.window-chrome', '.welcome-screen:visible', '.welcome-sidebar:visible']) {
    assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  }
  const loginChoice = page.getByRole('button', { name: /GitHub ile devam et/ });
  await loginChoice.hover();
  assert.equal(await loginChoice.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  await page.screenshot({ path: '/tmp/stardrop-black-welcome.png' });
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.locator('.device-login-card:visible').waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.device-login-card:visible').evaluate(el => el.contains(document.activeElement)), true);
  assert.equal(await page.locator('.device-login-card:visible').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).waitFor({ timeout: 15000 });
  const manualChoice = page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' });
  const workspaceSky = page.locator('.workspace-panel:visible .workspace-stars');
  assert.equal(await workspaceSky.locator('circle').count(), 70);
  assert.equal(await workspaceSky.evaluate(el => getComputedStyle(el).opacity), '0.38');
  assert.equal(await workspaceSky.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(await manualChoice.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  await manualChoice.hover();
  assert.equal(await manualChoice.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  const activeMenu = page.locator('[data-rail-tool="workbench"]:visible');
  assert.equal(await activeMenu.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.notEqual(await activeMenu.evaluate(el => getComputedStyle(el).boxShadow), 'none');
  const brandBounds = await page.locator('.app-shell:visible > .rail .brand strong').boundingBox();
  const tabBounds = await page.locator('.app-shell:visible .workspace-tabbar').boundingBox();
  assert.ok(Math.abs(brandBounds.y + brandBounds.height / 2 - tabBounds.y - tabBounds.height / 2) < 1);
  await page.locator('[data-rail-tool="library"]:visible').click();
  await page.locator('.library-card').filter({ hasText: 'LED Blink · F446RE' }).waitFor();
  assert.equal(await page.locator('.library-card').count(), 2);
  assert.equal(await page.getByText('Kod hazır', { exact: true }).count(), 2);
  assert.equal(await page.getByText('Başarılı', { exact: true }).count(), 0);
  await page.locator('.library-card').filter({ hasText: 'LED Blink · F446RE' }).click();
  assert.equal(await page.getByRole('button', { name: 'Geri', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Listeye dön', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Testlere dön', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Geri', exact: true }).click();
  await page.locator('.library-card').filter({ hasText: 'LED Blink · F446RE' }).click();
  await page.getByRole('button', { name: 'YENİ TESTTE AÇ' }).click();
  await page.getByRole('heading', { name: 'Hangi STM32?' }).waitFor();
  assert.match(await page.getByRole('combobox', { name: 'STM32 modeli' }).innerText(), /STM32F446RET6/);
  await page.getByRole('button', { name: 'DEVAM ET' }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Şemadaki adı' }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Parça adı' }).inputValue(), 'LED');
  const partInput = page.getByRole('textbox', { name: 'Parça adı' });
  assert.equal(await partInput.evaluate(el => getComputedStyle(el).userSelect), 'text');
  await partInput.focus();
  await page.keyboard.press('Control+a');
  assert.equal(await partInput.evaluate(el => el.selectionEnd - el.selectionStart), 3);
  await page.getByRole('button', { name: 'TESTLERİ GÖR' }).click();
  await page.getByRole('heading', { name: 'LED için neyi deneyeceğiz?' }).waitFor();
  assert.ok(await page.getByText('LED Blink · F446RE', { exact: true }).count());
  await page.getByRole('button', { name: 'BAĞLANTILARI GÖR' }).click();
  await page.getByRole('spinbutton', { name: 'Yanma süresi (s)', exact: true }).fill('1');
  assert.equal(await page.getByRole('spinbutton', { name: 'Yanma süresi (s)', exact: true }).evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))), true);
  await page.getByRole('spinbutton', { name: 'Sönük kalma süresi (s)', exact: true }).fill('2');
  assert.equal(await page.locator('.workspace-panel:visible .wizard-fields').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.equal(await page.getByRole('spinbutton', { name: 'Yanma süresi (s)', exact: true }).inputValue(), '1');
  assert.equal(await page.getByRole('spinbutton', { name: 'Sönük kalma süresi (s)', exact: true }).inputValue(), '2');
  await page.locator('[data-rail-tool="devices"]:visible').click();
  await page.getByRole('heading', { name: 'Cihazlar', exact: true }).waitFor();
  assert.equal(await page.locator('.workspace-panel:visible .workspace-stars circle').count(), 70);
  await page.locator('.device-maintenance summary').click();
  assert.equal(await page.getByRole('button', { name: 'Flash’ı sil', exact: true }).isEnabled(), false);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/stardrop-catalog-wizard.png' });
  console.log('Library templates open an isolated, correctly targeted test wizard.');
} finally { await browser.close(); }
