export async function inspectWatchFile(file, invoke, timeoutMs = 15000) {
  let timer;
  const operation = async () => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const result = await invoke('inspect_watch_elf', { bytes });
    if (!Array.isArray(result?.variables)) throw new Error('ELF çözümleme yanıtı geçersiz.');
    return result;
  };
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('ELF okuma 15 saniyede tamamlanamadı. Dosyayı yeniden seç; uygulama eskiyse yeniden başlat.')), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
