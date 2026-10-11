export function deviceUserCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error('GitHub doğrulama kodu geçersiz; yeniden giriş başlat.');
  return code;
}

export async function copyDeviceCode(value, browser = window) {
  const code = deviceUserCode(value);
  try {
    await browser.navigator.clipboard.writeText(code);
    return;
  } catch { /* Some desktop WebViews do not expose the Clipboard API. */ }
  const document = browser.document;
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = code;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;user-select:text;pointer-events:none';
  document.body.appendChild(field);
  try {
    field.focus(); field.select(); field.setSelectionRange(0, code.length);
    if (!document.execCommand('copy')) throw new Error('Panoya erişilemedi.');
  } finally {
    field.remove();
    previous?.focus();
  }
}
