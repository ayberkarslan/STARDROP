// Package TOP views, numbered counter-clockwise from pin 1. Sources:
// ST DS10086 Rev 5, figure 11 (UFQFPN48); ST DS10693 Rev 11,
// figure 10 (LQFP64). Keep package geometry separate from firmware support.
const F401_UFN48 = [
  'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'VSSA', 'VDDA',
  'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PB2',
  'VSS', 'VDD', 'PB10', 'VCAP_1', 'PB12', 'PB13', 'PB14', 'PB15', 'PA8',
  'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD', 'PA14', 'PA15',
  'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD',
];

const F446_LQFP64 = [
  'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1',
  'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2', 'PA3', 'VSS', 'VDD',
  'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10',
  'VCAP_1', 'VSS', 'VDD', 'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7',
  'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
  'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5',
  'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD',
];

const TARGET_PACKAGES = [
  { prefix: 'STM32F401CCU6', package: 'UFQFPN48', pins: F401_UFN48, build: 'stm32-hal-v1' },
  { prefix: 'STM32F401CDU6', package: 'UFQFPN48', pins: F401_UFN48, build: 'stm32-hal-v1' },
  { prefix: 'STM32F401CEU6', package: 'UFQFPN48', pins: F401_UFN48, build: null },
  { prefix: 'STM32F446RET6', package: 'LQFP64', pins: F446_LQFP64, build: null },
  { prefix: 'STM32F446RE', package: 'LQFP64', pins: F446_LQFP64, build: null },
];

export function targetPackage(part) {
  const normalized = String(part || '').toUpperCase();
  const target = TARGET_PACKAGES.find((item) => normalized.startsWith(item.prefix));
  return target ? { ...target, pins: target.pins.map((name, index) => ({ number: index + 1, name })) } : null;
}

export function pinNumberFor(part, gpio) {
  return targetPackage(part)?.pins.find((pin) => pin.name === gpio)?.number ?? null;
}

export function pinKind(name) {
  if (['PA13', 'PA14'].includes(name)) return 'swd';
  if (/^(?:VDD|VSS|VBAT|VSSA|VDDA|VCAP)/.test(name)) return 'power';
  if (['BOOT0', 'NRST'].includes(name)) return 'control';
  if (['PC14', 'PC15', 'PH0', 'PH1'].includes(name)) return 'oscillator';
  return /^P[A-K]\d+$/.test(name) ? 'gpio' : 'special';
}
