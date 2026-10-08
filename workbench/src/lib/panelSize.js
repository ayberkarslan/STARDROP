export function panelWidth(value, { min = 180, max = 520, viewport = 1440, reserve = 360, fallback = 210 } = {}) {
  const limit = Math.max(min, Math.min(max, viewport - reserve));
  const number = Number(value);
  return Math.round(Math.max(min, Math.min(limit, Number.isFinite(number) && number > 0 ? number : fallback)));
}
