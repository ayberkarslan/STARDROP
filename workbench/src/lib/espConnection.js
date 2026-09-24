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
  if ((await espJson(base, '/ping', { timeoutMs })).status !== 'ok') throw new Error('Bu adreste STARDROP ESP32 yanıtı yok.');
  return { base, wifi: await espJson(base, '/api/wifi/status', { timeoutMs }) };
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
import { espJson } from './espTransport.js';
