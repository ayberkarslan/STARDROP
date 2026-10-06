export const TELEMETRY_REASONS = {
  TARGET_OFFLINE: 'STM32’ye SWD üzerinden erişilemiyor. Beslemeyi ve SWD kablolarını kontrol et.',
  TARGET_CHANGED: 'Okuma sırasında STM32 değişti. İzlemeyi durdurup doğru kartla yeniden başlat.',
  SRAM_READ_FAILED: 'RAM okunamadı. SWD temasını ve hedefin beslemesini kontrol et.',
  ABI_INVALID: 'STM32 yazılımında STARDROP Telemetry ABI v1 yok. Telemetri destekli test yazılımını yükle.',
  CRC_INVALID: 'RAM ölçümünün CRC doğrulaması başarısız; bu örnek kullanılmadı.',
  SNAPSHOT_CHANGED: 'STM32 okuma sırasında ölçümü güncelledi; bu örnek atlandı.',
  FRAME_INVALID: 'RAM telemetri başlığı geçersiz; bu örnek kullanılmadı.',
  CHANNEL_INVALID: 'Kanal adı, birimi veya sayısal değeri geçersiz; bu örnek kullanılmadı.',
  CHANNEL_DUPLICATE: 'Firmware aynı kanal adını iki kez yayınladı.',
};
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function validateTelemetry(frame, uid, expected) {
  if (frame?.uid && frame.uid.toUpperCase() !== uid.toUpperCase()) throw new Error('Bağlı STM32 değişti; başka kartın ölçümleri kullanılmadı.');
  if (!frame?.connected || !frame.valid) throw new Error(TELEMETRY_REASONS[frame?.reason] || 'Geçerli telemetri alınamadı.');
  if (!/^[0-9a-f]{24}$/i.test(frame.uid) || frame.abi !== 1 || ![frame.sequence, frame.timestampMs, frame.sampleCounter,
    frame.testIdHash, frame.profileHash, frame.runHash].every(uint32) || frame.sequence % 2
    || ![0, 1, 2].includes(frame.sensorStatus) || !Array.isArray(frame.channels) || frame.channels.length > 8)
    throw new Error('ESP32 telemetri yanıtı geçersiz.');
  const names = new Set();
  for (const channel of frame.channels) {
    if (!/^[\x20-\x7e]{1,23}$/.test(channel.name) || !/^[\x20-\x7e]{0,11}$/.test(channel.unit)
      || names.has(channel.name) || !Number.isFinite(channel.value) || typeof channel.valid !== 'boolean')
      throw new Error('Telemetri kanalı geçersiz.');
    names.add(channel.name);
  }
  if (expected && ['testIdHash', 'profileHash', 'runHash'].some(key => frame[key] !== expected[key]))
    throw new Error('Yüklü firmware veya test çalıştırması değişti. Yeni izleme oturumu başlat.');
  return frame;
}

/** Serial, bounded sampling. A stopped in-flight request retains the SWD lease. */
export function createTelemetrySession({ hardware, ownerId, uid, expected, fetchSample, onFrame, onState,
  intervalMs = 500, clock = () => Date.now(), schedule = setTimeout, cancel = clearTimeout }) {
  let lease = null, timer = null, stopped = true, inflight = false;
  let bound = expected || null, previous = null, lastAdvance = null, failures = 0, skipped = 0;
  const release = () => { if (lease) { hardware.release(lease); lease = null; } };
  const stop = (message = 'İzleme durduruldu.', status = 'paused') => {
    stopped = true; cancel(timer); timer = null;
    if (!inflight) release();
    onState?.({ status, message });
  };
  const sample = async () => {
    if (stopped) return;
    inflight = true;
    try {
      const raw = await fetchSample();
      if (stopped) return;
      if (raw?.uid && raw.uid.toUpperCase() !== uid.toUpperCase()) {
        stop('Bağlı STM32 değişti; başka kartın ölçümleri kullanılmadı.', 'error'); return;
      }
      if (raw?.reason === 'SNAPSHOT_CHANGED' || raw?.reason === 'CRC_INVALID') {
        failures++;
        if (failures >= 5) stop(TELEMETRY_REASONS[raw.reason], 'error');
        else onState?.({ status: 'retrying', message: TELEMETRY_REASONS[raw.reason] });
        return;
      }
      const frame = validateTelemetry(raw, uid, bound);
      bound ||= { testIdHash: frame.testIdHash, profileHash: frame.profileHash, runHash: frame.runHash };
      const delta = previous ? (frame.sampleCounter - previous.sampleCounter) >>> 0 : frame.sampleCounter ? 1 : 0;
      if (previous && (delta > 0x7fffffff || ((frame.timestampMs - previous.timestampMs) >>> 0) > 0x7fffffff)) {
        stop('STM32 örnek sayacı yeniden başladı. Yeni izleme oturumu başlat.', 'error'); return;
      }
      if (previous && JSON.stringify(frame.channels.map(c => [c.name, c.unit])) !== JSON.stringify(previous.channels.map(c => [c.name, c.unit]))) {
        stop('Firmware kanal şeması değişti. Yeni izleme oturumu başlat.', 'error'); return;
      }
      const now = clock();
      if (delta > 0) { lastAdvance = now; skipped += Math.max(0, delta - 1); }
      const stale = lastAdvance === null || now - lastAdvance > Math.max(2000, intervalMs * 3);
      previous = frame; failures = 0;
      onFrame?.({ ...frame, receivedAt: now, newSample: delta > 0, stale, skipped,
        ageMs: lastAdvance === null ? null : now - lastAdvance });
      onState?.({ status: frame.sensorStatus === 2 ? 'sensor-error' : stale ? 'stale' : 'live',
        message: frame.sensorStatus === 2 ? 'Sensör okuma hatası; son değerler canlı ölçüm değildir.'
          : stale ? 'Yeni örnek üretilmiyor. MCU duraklamış veya sensör hazır olmayabilir.' : 'SWD üzerinden canlı ölçüm' });
    } catch (error) {
      if (stopped) return;
      failures++;
      const terminal = /değişti|yeniden başladı|ABI|geçersiz|yok/.test(error.message) || failures >= 3;
      if (terminal) stop(error.message, 'error');
      else onState?.({ status: 'retrying', message: error.message });
    } finally {
      inflight = false;
      if (stopped) release();
      else timer = schedule(sample, intervalMs);
    }
  };
  return {
    start() {
      if (!stopped || lease) return;
      if (!/^[0-9a-f]{24}$/i.test(uid || '')) throw new Error('Önce bağlı STM32’yi seç.');
      lease = hardware.acquire(ownerId, 'Canlı izleme'); stopped = false;
      onState?.({ status: 'connecting', message: 'RAM telemetrisi doğrulanıyor…' });
      void sample();
    }, stop,
  };
}
export function telemetryCsv(samples) {
  const cell = value => '"' + String(typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const rows = [['host_time', 'uid', 'run_hash', 'mcu_ms', 'sample_counter', 'sensor_status', 'channel', 'unit', 'value', 'valid']];
  for (const sample of samples) for (const channel of sample.channels) rows.push([
    new Date(sample.receivedAt).toISOString(), sample.uid, sample.runHash, sample.timestampMs,
    sample.sampleCounter, sample.sensorStatus, channel.name, channel.unit, channel.value, channel.valid && sample.sensorStatus === 1,
  ]);
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
