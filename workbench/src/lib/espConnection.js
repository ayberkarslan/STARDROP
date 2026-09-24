export function normalizeEspAddress(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('ESP32 adresi boş olamaz.');
  const url = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`);
  if (url.protocol !== 'http:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ESP32 adresi http://IP biçiminde olmalı.');
  }
  return url.origin;
}

export async function probeEsp(address, timeoutMs = 3500) {
  const base = normalizeEspAddress(address);
  const response = await fetch(`${base}/ping`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Bu adreste STARDROP ESP32 yanıtı yok.');
  const wifiResponse = await fetch(`${base}/api/wifi/status`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!wifiResponse.ok) throw new Error('ESP32 Wi-Fi durumu okunamadı.');
  return { base, wifi: await wifiResponse.json() };
}

export async function discoverEspDevices() {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('discover_esp');
}

export function discoveryCandidates(devices, savedAddress, savedMac) {
  const ordered = [...devices].sort((a, b) => Number(b.mac === savedMac) - Number(a.mac === savedMac));
  const addresses = ordered.flatMap((device) => [device.replyAddress, device.ip]);
  addresses.push(savedAddress, 'http://192.168.4.1');
  const unique = new Set();
  for (const address of addresses) {
    try { unique.add(normalizeEspAddress(address)); } catch (_) { /* Bozuk keşif yanıtını atla. */ }
  }
  return [...unique];
}
