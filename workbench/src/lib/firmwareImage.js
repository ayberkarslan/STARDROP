const FLASH_BASE = 0x08000000;
const MAX_IMAGE_BYTES = 1024 * 1024;

export function elfToBin(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46 || bytes[4] !== 1 || bytes[5] !== 1) {
    throw new Error('Yalnızca 32-bit little-endian ARM ELF destekleniyor.');
  }
  if (view.getUint16(18, true) !== 40) throw new Error('ELF dosyası ARM hedefi için değil.');
  const table = view.getUint32(28, true);
  const entrySize = view.getUint16(42, true);
  const count = view.getUint16(44, true);
  if (entrySize < 32 || count === 0 || table + entrySize * count > bytes.length) throw new Error('ELF program tablosu bozuk.');
  const segments = [];
  let end = FLASH_BASE;
  for (let index = 0; index < count; index++) {
    const offset = table + index * entrySize;
    const type = view.getUint32(offset, true);
    const fileOffset = view.getUint32(offset + 4, true);
    const address = view.getUint32(offset + 12, true);
    const size = view.getUint32(offset + 16, true);
    if (type !== 1 || !size || address < FLASH_BASE || address >= FLASH_BASE + MAX_IMAGE_BYTES) continue;
    if (fileOffset + size > bytes.length || address + size > FLASH_BASE + MAX_IMAGE_BYTES) throw new Error('ELF flash segmenti dosya veya hedef sınırını aşıyor.');
    segments.push({ fileOffset, address, size });
    end = Math.max(end, address + size);
  }
  if (!segments.length) throw new Error('ELF içinde flash segmenti bulunamadı.');
  if (!segments.some((segment) => segment.address === FLASH_BASE)) throw new Error('Firmware 0x08000000 adresinden başlamıyor; güvenli yükleme için linker ayarını kontrol et.');
  const output = new Uint8Array(end - FLASH_BASE);
  output.fill(0xff);
  for (const segment of segments) output.set(bytes.subarray(segment.fileOffset, segment.fileOffset + segment.size), segment.address - FLASH_BASE);
  return output;
}

export async function prepareFirmware(file, flashSizeKb) {
  if (!file || !/\.(bin|elf)$/i.test(file.name)) throw new Error('Yalnızca .bin veya .elf seçebilirsin.');
  const binary = file.name.toLowerCase().endsWith('.elf') ? elfToBin(await file.arrayBuffer()) : new Uint8Array(await file.arrayBuffer());
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error('Firmware boş veya 1 MB sınırını aşıyor.');
  if (flashSizeKb && binary.length > flashSizeKb * 1024) throw new Error(`Firmware hedefin ${flashSizeKb} KB flash kapasitesini aşıyor.`);
  return new File([binary], file.name.replace(/\.elf$/i, '.bin'), { type: 'application/octet-stream' });
}
