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
    if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock-only' });
    if (command === 'load_secret') return secrets.get(args.key) || null;
    if (command === 'save_secret') { secrets.set(args.key, args.value); return 'memory'; }
    if (command === 'discover_esp') return [];
    if (command === 'esp_http') throw new Error('Mock ESP offline');
    if (command === 'esp_upload' || command === 'compile_code_test') throw new Error('This check must not flash or compile');
    if (command === 'code_repo_status') return { warning: '', activeSha: null, latestSha: null };
    return null;
  } };
});
await page.route('https://api.github.com/**', route => route.fulfill({ status: route.request().url().endsWith('/user') ? 200 : 404,
  contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/user') ? { login: 'ui-test' } : { message: 'Mock repo unavailable' }) }));
try {
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.getByRole('button', { name: /Kart dosyamı yükleyeceğim/ }).click({ timeout: 15000 });
  await page.locator('.workspace-panel:visible input[accept=".NET,.net,.txt"]').setInputFiles('../parse_algorithm/test.net');
  await page.getByRole('heading', { name: 'Neyi denemek istersin?' }).waitFor();
  const cards = page.locator('.wizard-components button');
  assert.equal(await cards.filter({ hasText: /LED · PA15/ }).count(), 1);
  assert.equal(await cards.filter({ hasText: /LED · PB7/ }).count(), 1);
  assert.equal(await cards.filter({ hasText: /Güç LED’i/ }).count(), 3);
  assert.equal(await cards.filter({ hasText: /D3 · Güç LED’i/ }).isDisabled(), true);
  await cards.filter({ hasText: /D6 · LED · PA15/ }).click();
  await page.getByRole('button', { name: 'GERİ', exact: true }).click();
  await page.getByRole('heading', { name: 'Neyi denemek istersin?' }).waitFor();
  await page.screenshot({ path: '/tmp/stardrop-net-leds.png' });
  assert.deepEqual(errors, []);
  console.log('NET LED: real fixture, GPIO paths, ambiguous outputs, selection and back passed.');
} finally { await browser.close(); }
