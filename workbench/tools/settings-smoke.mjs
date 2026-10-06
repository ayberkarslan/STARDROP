import assert from 'node:assert/strict';
import catalog from '../../code-repo/catalog/catalog.json' with { type: 'json' };
import { createManualLedProfile } from '../src/lib/boardProfile.js';
import { makeBackup } from '../src/lib/settings.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const persisted = new Map(), volatile = new Map(), exports = [];
const testKey = 'ghp_UI_TEST_ONLY_NOT_A_REAL_TOKEN';
const sha = 'a'.repeat(40);
let records = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('mockIpc', async (command, args = {}) => {
    if (command === 'load_secret') return volatile.get(args.key) || persisted.get(args.key) || null;
    if (command === 'save_secret') { persisted.set(args.key, args.value); return 'os'; }
    if (command === 'delete_secret') { persisted.delete(args.key); volatile.delete(args.key); return; }
    if (command === 'save_repo_secret') {
      persisted.delete('github_repo_token'); volatile.delete('github_repo_token');
      (args.remember ? persisted : volatile).set('github_repo_token', args.value); return args.remember ? 'os' : 'memory';
    }
    if (command === 'github_device_start') return JSON.stringify({ user_code: 'MOCK', device_code: 'mock', expires_in: 900, interval: 5 });
    if (command === 'github_device_poll') return JSON.stringify({ access_token: 'mock-not-a-token' });
    if (command === 'discover_esp') return [];
    if (command === 'esp_http') throw Error('Mock ESP offline');
    if (command === 'target_registry_load') return records;
    if (command === 'target_registry_import') { records = { ...records, ...args.records }; return records; }
    if (command === 'toolchain_status') return { ready: true, tools: [{ name: 'arm-none-eabi-gcc', ready: true, version: 'Mock GCC 14' }] };
    if (command === 'settings_system_info') return { version: '0.1.0', os: 'linux', arch: 'x86_64', exportDirectory: '/tmp/exports' };
    if (command === 'code_cache_info') return { activeSha: sha, snapshots: [{ sha, verified: true, active: true }] };
    if (command === 'code_repo_status') return { activeSha: sha, latestSha: sha, offline: false };
    if (command === 'github_repo_diagnostic') return { userStatus: 200, repositoryStatus: 200, catalogStatus: 200 };
    if (command === 'settings_export') { exports.push(JSON.parse(args.content)); return `/tmp/exports/${args.kind}.json`; }
    return null;
  });
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, invoke: (command, args) => window.mockIpc(command, args) };
  });
  await page.route('https://api.github.com/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/user' ? { login: 'ui-test' } : path.endsWith('/contents/stardrop/catalog/catalog.json')
      ? { sha, content: Buffer.from(JSON.stringify(catalog)).toString('base64') } : path.endsWith('/contents/stardrop/library') || path.endsWith('/contents/stardrop') ? [] : { permissions: { push: true } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:1420');
  await page.getByRole('button', { name: /GitHub ile devam et/ }).click();
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).waitFor({ timeout: 15000 });
  const settings = async () => { await page.locator('[data-rail-tool="settings"]:visible').click(); await page.locator('.settings-hub:visible').waitFor(); };
  await settings();
  const hub = page.locator('.settings-hub:visible');
  assert.equal(await hub.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(0, 0, 0)');
  assert.equal(await hub.locator('.settings-sections button').count(), 7);
  await hub.getByLabel('Ayarlarda ara').click();
  assert.equal(await hub.getByLabel('Ayarlarda ara').evaluate(el => getComputedStyle(el).caretColor), 'rgb(255, 255, 255)');
  assert.equal(await hub.locator('.settings-search').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(255, 255, 255)');
  await hub.getByLabel('Ayarlarda ara').fill('anahtar');
  assert.equal(await hub.locator('.settings-sections button').count(), 1);
  await hub.getByLabel('Ayarlarda ara').fill('');
  await hub.getByRole('button', { name: 'Test kaynakları', exact: true }).click();
  await hub.getByLabel('Bu bilgisayarda hatırla').click();
  await page.waitForFunction(() => document.querySelector('.settings-hub input[aria-label="Bu bilgisayarda hatırla"]').checked);
  await hub.getByLabel('Depo anahtarı', { exact: true }).fill(testKey);
  await hub.getByRole('button', { name: 'KAYDET', exact: true }).click();
  await hub.getByText('Anahtar güvenli kasada; yeniden açınca kullanılacak.').waitFor();
  assert.equal(persisted.get('github_repo_token'), testKey);
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes(testKey));
  await hub.getByRole('button', { name: 'Atölye ve yedekleme', exact: true }).click();
  await hub.getByRole('button', { name: 'YEDEK AL' }).click();
  await hub.getByText(/Kaydedildi:/).waitFor();
  assert.equal(exports.at(-1).format, 'stardrop-workshop');
  assert.ok(!JSON.stringify(exports.at(-1)).includes(testKey));
  const uid = '001300155231501920323239';
  const profile = createManualLedProfile({ name: 'Yedek LED', mcuPart: 'STM32F446RET6', pin: 'PA5' });
  const backup = makeBackup({ preferences: {}, githubConfig: { repository: 'ayberkarslan/stardrop-code-repo', ref: 'main' },
    profiles: [profile], records: { [uid]: { uid, label: 'Atölye kartı', model: 'STM32F446', createdAt: 1, updatedAt: 2 } } });
  await hub.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('heading', { name: 'Yedek geri yüklensin mi?' }).waitFor();
  await page.getByRole('button', { name: 'ONAYLA', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.workspace-tab')].some(el => el.textContent.includes('Yedek LED')));
  assert.equal(records[uid].label, 'Atölye kartı');
  await settings();
  await hub.getByRole('button', { name: 'Atölye ve yedekleme', exact: true }).click();
  await hub.getByText('Atölye kartı', { exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Görünüm', exact: true }).click();
  await hub.getByLabel('Hareketi azalt').check();
  assert.equal(await page.locator('body').getAttribute('data-reduced-motion'), 'true');
  await page.screenshot({ path: '/tmp/stardrop-settings-black.png' });
  volatile.clear(); await page.reload();
  await page.getByRole('button', { name: /ile devam et/ }).click();
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).waitFor({ timeout: 15000 });
  await settings();
  await hub.getByRole('button', { name: 'Test kaynakları', exact: true }).click();
  assert.equal(await hub.getByLabel('Bu bilgisayarda hatırla').isChecked(), true);
  await hub.getByPlaceholder('Anahtar kayıtlı').waitFor();
  await hub.getByLabel('Bu bilgisayarda hatırla').click();
  await page.waitForFunction(() => !document.querySelector('.settings-hub input[aria-label="Bu bilgisayarda hatırla"]').checked);
  await hub.getByText(/Anahtar yalnız oturum belleğinde/).waitFor();
  assert.equal(persisted.has('github_repo_token'), false);
  assert.equal(volatile.get('github_repo_token'), testKey);
  await hub.getByRole('button', { name: 'Tanılama', exact: true }).click();
  await hub.getByRole('button', { name: 'RAPORU KAYDET' }).click();
  await hub.getByText(/Kaydedildi:/).waitFor();
  assert.equal(exports.at(-1).format, 'stardrop-diagnostic');
  assert.ok(!JSON.stringify(exports.at(-1)).includes(testKey));
  volatile.clear(); await page.reload();
  await page.getByRole('button', { name: /ile devam et/ }).click();
  await page.getByRole('button', { name: 'Bağlantıları kendim seçeceğim' }).waitFor({ timeout: 15000 });
  await settings(); await hub.getByRole('button', { name: 'Test kaynakları', exact: true }).click();
  await hub.getByPlaceholder('Fine-grained token').waitFor();
  assert.equal(await hub.getByLabel('Bu bilgisayarda hatırla').isChecked(), false);
  assert.deepEqual(errors, []);
  console.log('Settings: black sections/search, remember across restart, session-only forget, backup/restore, safe report and reduced motion passed (mock native storage).');
} finally { await browser.close(); }
