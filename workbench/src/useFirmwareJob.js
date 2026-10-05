import { useState } from 'react';
import { prepareFirmware } from './lib/firmwareImage.js';
import { espJson, espStream, espUpload } from './lib/espTransport.js';

export default function useFirmwareJob({ documentId, hardware, esp, activeBridge, target, refreshTargetAt, setNotice }) {
  const [firmware, setFirmware] = useState(null);
  const [flashLog, setFlashLog] = useState([]);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashBusy, setFlashBusy] = useState(false);
  const appendFlashLog = (msg, type = 'info') => setFlashLog((logs) => [...logs.slice(-299), {
    msg, type, time: new Date().toLocaleTimeString('tr-TR'),
  }]);
  const flashFirmware = async (selected = firmware, parentLease = null) => {
    if (!selected) { setNotice('Önce bir .bin veya .elf seç.'); return false; }
    if (esp.status !== 'online' || !activeBridge || !target?.connected) { setNotice('Önce ESP32 ve STM32 hedef bağlantısını doğrula.'); return false; }
    let lease;
    try {
      if (parentLease && !hardware.owns(parentLease)) throw new Error('Donanım işlem kilidi geçersiz.');
      lease = parentLease || hardware.acquire(documentId, 'STM32 yükleme');
    } catch (error) { setNotice(error.message); return false; }
    // File, bridge and target belong to this render, not whichever tab is active later.
    const base = activeBridge;
    const expectedUid = target.uid;
    setFlashBusy(true); setFlashProgress(0);
    setFlashLog([{ msg: 'Yazılım ESP32 belleğine aktarılıyor...', type: 'info', time: new Date().toLocaleTimeString('tr-TR') }]);
    try {
      const image = await prepareFirmware(selected, target.flashSizeKb);
      const live = await espJson(base, '/api/target/status', { timeoutMs: 6000 });
      if (!expectedUid || !live.connected || live.uid !== expectedUid) throw new Error('STM32 hedefi değişti; flash yapılmadı.');
      await espUpload(base, image);
      appendFlashLog(`Yazılım belleğe alındı. SWD Flash akışı başlıyor... (${selected.name}, ${image.size} bayt)`, 'success');
      await espStream(base, '/stream-flash', (event) => {
        if (event.msg) appendFlashLog(event.msg, event.type || 'info');
        if (Number.isFinite(event.pct)) setFlashProgress(event.pct);
      });
      appendFlashLog('STM32 başarıyla programlandı ve çalıştırıldı!', 'success');
      await refreshTargetAt(base);
      return true;
    } catch (error) { appendFlashLog(`Hata: ${error.message}`, 'error'); setNotice(`Flash başarısız: ${error.message}`); return false; }
    finally { setFlashBusy(false); if (!parentLease) hardware.release(lease); }
  };
  return { firmware, setFirmware, flashLog, setFlashLog, flashProgress, flashBusy, flashFirmware };
}
