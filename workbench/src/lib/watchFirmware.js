import { prepareFirmware } from './firmwareImage.js';
import { espJson, espStream, espUpload } from './espTransport.js';

/** Reuse the watch lease: no gap in which a different tab can program the target. */
export async function reloadWatchFirmware({ hardware, lease, file, uid, model, imageSha256, imageSize, base,
  isStopped = () => false, onNotice, onProgress, onLoaded,
  prepare = prepareFirmware, json = espJson, upload = espUpload, stream = espStream }) {
  const check = () => {
    if (!hardware.owns(lease)) throw new Error('İzleme donanım kilidi geçersiz; yükleme yapılmadı.');
    if (isStopped()) throw new Error('İzleme durduruldu; yeni flash işlemi başlatılmadı.');
  };
  const target = async () => {
    const live = await json(base, '/api/target/status', { timeoutMs: 6000 });
    check();
    if (!live.connected || live.uid !== uid || live.model !== model) throw new Error('STM32 hedefi değişti; yükleme yapılmadı.');
    return live;
  };
  check(); const before = await target();
  const image = await prepare(file, before.flashSizeKb);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await image.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
  check();
  if (hash !== imageSha256 || image.size !== imageSize) throw new Error('Yüklenecek dosya izlenen ELF ile uyuşmuyor; flash yapılmadı.');
  onNotice?.(`ELF uyuşmuyor; kod güncelleniyor: ${file.name}. Mevcut firmware değiştirilecek.`);
  onProgress?.({ status: 'programming', message: `${file.name} ESP32’ye aktarılıyor…`, progress: 0 });
  await upload(base, image);
  check(); await target(); check();
  // Once flashing starts, let it finish even when monitoring is stopped or hidden.
  await stream(base, '/stream-flash', event => {
    onProgress?.({ status: 'programming', message: event.msg || `${file.name} yazılıyor ve doğrulanıyor…`, progress: Number.isFinite(event.pct) ? event.pct : undefined });
  });
  onLoaded?.(uid, file);
  onNotice?.(`${file.name} yüklendi. İzleme öncesinde ELF eşleşmesi yeniden doğrulanacak.`);
}
