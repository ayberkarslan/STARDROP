import packageData from '../../targets/packages.json' with { type: 'json' };

// One versioned source of truth is shared with the native compiler validator.
export function targetPackage(part) {
  const normalized = String(part || '').toUpperCase();
  const target = packageData.targets.find((item) => normalized.startsWith(item.prefix));
  const names = target && packageData.packages[target.pinMap];
  return names ? { ...target, pins: names.map((name, index) => ({ number: index + 1, name })) } : null;
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
