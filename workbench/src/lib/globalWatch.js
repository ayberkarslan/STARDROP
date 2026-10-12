export const WATCH_REASONS = {
  TARGET_OFFLINE: 'STM32 bağlantısı yok.', TARGET_CHANGED: 'Bağlı STM32 değişti; izleme durduruldu.',
  ELF_FIRMWARE_MISMATCH: 'ELF karta yüklenen yazılımla eşleşmiyor. Otomatik güncelleme için doğrulanmış uyumsuzluk yanıtı gerekir; eski ESP firmware’ini güncelle.',
  FLASH_READ_FAILED: 'Flash güvenilir biçimde okunamadı; otomatik yükleme yapılmadı. SWD bağlantısını kontrol et.',
  WATCH_SESSION_INVALID: 'İzleme oturumu geçersiz; yazılım yüklenmiş veya ESP yeniden başlamış olabilir.',
  WATCH_TARGET_UNSUPPORTED: 'Bu STM32 için güvenli RAM okuma sınırları tanımlı değil.',
  WATCH_ADDRESS_INVALID: 'Değişken adresi hedef RAM sınırlarının dışında.', WATCH_REQUEST_INVALID: 'RAM okuma isteği geçersiz.',
  WATCH_RATE_LIMIT: 'RAM okuma aralığı çok kısa.', SRAM_READ_FAILED: 'SWD üzerinden RAM okunamadı.',
};
export function variableId(variable) { return `${variable.name}@${variable.address.toString(16)}`; }
export function resolveWatchName(elf, name) {
  const expression = name.trim();
  const matches = (elf?.variables || []).filter(variable => variable.name === expression);
  if (!matches.length) throw new Error(`“${expression}” ELF içinde bulunamadı. Global değişkenin tam adını yaz.`);
  if (matches.length > 1) throw new Error('Bu isim birden fazla değişkene ait. ELF listesinden adresiyle seç.');
  return matches[0];
}
export function decodeVariable(variable, raw) {
  if (raw.address !== variable.address || !new RegExp(`^[a-f0-9]{${variable.size * 2}}$`, 'i').test(raw.hex || '')) throw new Error('RAM yanıtındaki adres veya boyut ELF ile uyuşmuyor.');
  const bytes = Uint8Array.from(raw.hex.match(/../g), hex => parseInt(hex, 16));
  const view = new DataView(bytes.buffer); let value;
  if (variable.kind === 'float' && [4, 8].includes(variable.size)) value = variable.size === 4 ? view.getFloat32(0, true) : view.getFloat64(0, true);
  else if (['signed', 'unsigned'].includes(variable.kind) && [1, 2, 4, 8].includes(variable.size)) {
    const signed = variable.kind === 'signed';
    if (variable.size === 8) {
      const integer = signed ? view.getBigInt64(0, true) : view.getBigUint64(0, true);
      value = integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER) ? integer.toString() : Number(integer);
    } else value = view[`${signed ? 'getInt' : 'getUint'}${variable.size * 8}`](0, true);
  } else if (variable.kind === 'bool' && variable.size === 1) value = bytes[0] ? 1 : 0;
  else throw new Error('ELF değişkeninin türü desteklenmiyor.');
  return { ...variable, id: variableId(variable), value, valid: raw.stable === true && (typeof value === 'string' || Number.isFinite(value)) };
}

/** The lease is held during verification and every pending read, even after stop. */
export function createGlobalWatch({ hardware, ownerId, uid, elf, variables, verify, read, onFrame, onState, reloadFirmware,
  intervalMs = 500, schedule = setTimeout, cancel = clearTimeout, clock = Date.now }) {
  let lease = null, timer = null, stopped = true, inflight = false, session = null, errors = 0;
  let watched = [...variables];
  const checkVariables = next => {
    if (!next.length || next.length > 16 || new Set(next.map(variableId)).size !== next.length
      || next.some(v => !elf.variables.some(item => variableId(item) === variableId(v) && item.kind === v.kind && item.size === v.size))) throw new Error('ELF ve 1–16 geçerli global değişken seç.');
  };
  const release = () => { if (lease) { hardware.release(lease); lease = null; } };
  const stop = (message = 'Değişken izleme durduruldu.', status = 'paused') => {
    stopped = true; cancel(timer); timer = null; if (!inflight) release(); onState?.({ status, message });
  };
  const validate = raw => {
    if (raw.reason === 'WATCH_REQUEST_INVALID') {
      const details = { UID_FORMAT_INVALID: 'STM32 UID biçimi', HASH_FORMAT_INVALID: 'ELF SHA-256 özeti', IMAGE_SIZE_INVALID: 'ELF flash boyutu', BODY_TOO_LARGE: 'istek boyutu' };
      throw new Error(raw.requestVersion === 2 ? `ESP32 isteği reddetti: ${details[raw.detail] || raw.detail || 'bilinmeyen alan'} geçersiz.`
        : 'ESP32 eski izleme isteği doğrulamasını kullanıyor. S3 firmware’ini güncelle; sürüm watch-uid-case-v2 olmalı.');
    }
    if (!raw.valid) throw new Error(WATCH_REASONS[raw.reason] || `RAM okuması geçersiz: ${raw.reason || 'bilinmiyor'}`);
    if (raw.uid !== uid || raw.sha256 !== elf.imageSha256 || typeof raw.session !== 'string' || !raw.session) throw new Error('Hedef veya ELF kimliği değişti; izleme durduruldu.');
  };
  const sample = async () => {
    if (stopped) return;
    inflight = true;
    try {
      // Liste okuma sürerken değişebilir; cevabı isteğin kendi listesiyle çöz.
      const requested = [...watched];
      const raw = await read(session, requested);
      if (stopped) return;
      validate(raw); if (raw.session !== session || !Array.isArray(raw.values) || raw.values.length !== requested.length) throw new Error('RAM oturumu veya değişken listesi değişti.');
      const values = requested.map((v, i) => decodeVariable(v, raw.values[i]));
      errors = 0; onFrame?.({ receivedAt: clock(), uid, values });
      onState?.({ status: 'live', message: 'Global değişkenler RAM’den okunuyor. Değerlerin değişmemesi bağlantı kesildiği anlamına gelmez.' });
    } catch (error) {
      if (!stopped) {
        if (++errors >= 3 || /ELF|değişti|geçersiz|sınır|uyuşmuyor|tanımlı/.test(error.message)) stop(error.message, 'error');
        else onState?.({ status: 'retrying', message: error.message });
      }
    } finally {
      inflight = false; if (stopped) release(); else timer = schedule(sample, intervalMs);
    }
  };
  return {
    async start() {
      if (!stopped || lease) throw new Error('İzleme zaten sürüyor.');
      // ESP uses uppercase hex for UID. Keep wire identity unchanged.
      if (!/^[a-f0-9]{24}$/i.test(uid || '') || /^(0{24}|f{24})$/i.test(uid)) throw new Error('STM32 UID geçersiz; hedef bağlantısını yenile.');
      if (!/^[a-f0-9]{64}$/.test(elf?.imageSha256 || '') || !Number.isInteger(elf.imageSize) || elf.imageSize < 64 || elf.imageSize > 1048576
        || !Array.isArray(elf.variables)) throw new Error('ELF flash bilgisi geçersiz; dosyayı yeniden seç.');
      checkVariables(variables);
      lease = hardware.acquire(ownerId, 'Global değişken izleme'); stopped = false; inflight = true;
      onState?.({ status: 'verifying', message: 'ELF flash’taki yazılımla karşılaştırılıyor; STM32 durdurulmuyor…' });
      try {
        let result = await verify();
        if (stopped) return;
        if (!result.valid && result.reason === 'ELF_FIRMWARE_MISMATCH' && result.mismatchConfirmed === true
          && result.uid === uid && result.sha256 === elf.imageSha256 && reloadFirmware) {
          onState?.({ status: 'programming', message: 'ELF uyuşmuyor; seçilen yazılım karta yükleniyor…' });
          await reloadFirmware(lease, () => stopped);
          if (stopped) return;
          onState?.({ status: 'verifying', message: 'Yazılım yüklendi; flash eşleşmesi yeniden doğrulanıyor…' });
          result = await verify();
          if (stopped) return;
        }
        validate(result); session = result.session;
      } catch (error) { if (!stopped) stop(error.message, 'error'); }
      finally { inflight = false; if (stopped) release(); }
      if (!stopped) void sample();
    }, stop,
    updateVariables(next) { checkVariables(next); watched = [...next]; },
  };
}
export function globalWatchCsv(frames) {
  const cell = value => '"' + String(typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const rows = [['host_time', 'uid', 'name', 'type', 'address', 'value', 'valid']];
  for (const frame of frames) for (const v of frame.values) rows.push([new Date(frame.receivedAt).toISOString(), frame.uid, v.name, v.typeName, `0x${v.address.toString(16)}`, v.value, v.valid]);
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
