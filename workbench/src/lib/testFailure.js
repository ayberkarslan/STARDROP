export function testFailureMessage(error) {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error?.error === 'string' && error.error.trim()) return error.error.trim();
  return 'Beklenmeyen bir hata oluştu. Test kaynağı ve işlem günlüğünü kontrol et.';
}
