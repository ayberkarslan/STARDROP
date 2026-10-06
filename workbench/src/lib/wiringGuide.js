import { pinNumberFor, targetPackage } from './targetPins.js';

export const ESP_WIRING_PROFILES = [
  { value: 's3', label: 'ESP32-S3 · bu projenin profili', swclk: 4, swdio: 5, reset: 6 },
  { value: 'devkit', label: 'ESP32 DevKit V1 · bu projenin profili', swclk: 18, swdio: 19, reset: null },
  { value: 'c3', label: 'ESP32-C3 SuperMini · bu projenin profili', swclk: 20, swdio: 21, reset: 3 },
];
export const WIRING_BOARDS = [
  { value: 'custom', label: 'Özel PCB / başka kart' },
  { value: 'nucleo', label: 'Nucleo F446RE · MB1136', mcu: 'STM32F446RET6', pins: { SWDIO: 'CN7 · 13', SWCLK: 'CN7 · 15', GND: 'CN7 · 19', NRST: 'CN7 · 14' } },
  { value: 'blackpill', label: 'BlackPill · STM32F401', pins: { SWDIO: 'SWD başlığı · DIO / IO', SWCLK: 'SWD başlığı · CLK', GND: 'GND', NRST: 'NRST / RST' } },
];
export const WIRING_MCUS = [
  { value: 'STM32F446RET6', label: 'STM32F446RET6 · LQFP64' },
  { value: 'STM32F401CCU6', label: 'STM32F401CCU6 · UFQFPN48' },
  { value: 'STM32F401CDU6', label: 'STM32F401CDU6 · UFQFPN48' },
  { value: 'STM32F401CEU6', label: 'STM32F401CEU6 · UFQFPN48' },
  { value: 'unknown', label: 'Başka / henüz bilinmiyor' },
];
export function guideMcu(model) {
  return WIRING_MCUS.find(item => item.value !== 'unknown' && String(model || '').toUpperCase().startsWith(item.value))?.value
    || (String(model || '').toUpperCase() === 'STM32F446RE' ? 'STM32F446RET6' : 'unknown');
}
export function wiringRows({ programmer, espProfile = 's3', board = 'custom', mcu = 'unknown' }) {
  const live = espProfile === 'live';
  const profile = ESP_WIRING_PROFILES.find(item => item.value === espProfile);
  const boardProfile = WIRING_BOARDS.find(item => item.value === board) || WIRING_BOARDS[0];
  const part = boardProfile.mcu || mcu;
  const known = Boolean(targetPackage(part));
  const gpio = pin => Number.isInteger(pin) && pin >= 0 ? `GPIO ${pin}` : 'GPIO bildirilmedi';
  const resetPin = live ? programmer?.resetPin : profile?.reset;
  const resetAvailable = live ? programmer?.resetAvailable === true : resetPin !== null && resetPin !== undefined;
  return [
    { signal: 'SWDIO', esp: gpio(live ? programmer?.swdioPin : profile?.swdio), stm: known || board !== 'custom' ? 'PA13 · SWDIO' : 'Şemadaki SWDIO', optional: false },
    { signal: 'SWCLK', esp: gpio(live ? programmer?.swclkPin : profile?.swclk), stm: known || board !== 'custom' ? 'PA14 · SWCLK' : 'Şemadaki SWCLK', optional: false },
    { signal: 'GND', esp: 'GND', stm: 'GND · ortak toprak', optional: false },
    { signal: 'NRST', esp: resetAvailable ? gpio(resetPin) : 'Bu profilde kullanılmıyor', stm: 'NRST · reset', optional: true, available: resetAvailable },
  ].map(row => ({ ...row, location: boardProfile.pins?.[row.signal] || (row.signal === 'GND' ? 'Kartın GND noktası' : known ? `MCU bacağı ${pinNumberFor(part, row.signal === 'SWDIO' ? 'PA13' : row.signal === 'SWCLK' ? 'PA14' : 'NRST')} · PCB başlığı değil` : 'Kart şemasından kontrol et') }));
}
