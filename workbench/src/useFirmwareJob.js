import { useState } from 'react';
import { prepareFirmware } from './lib/firmwareImage.js';
import { espJson, espStream, espUpload } from './lib/espTransport.js';

export default function useFirmwareJob({ documentId, hardware, esp, activeBridge, target, refreshTargetAt, setNotice }) {
  const [firmware, setFirmware] = useState(null);
  const [flashLog, setFlashLog] = useState([]);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashBusy, setFlashBusy] = useState(false);
  const [flashStage, setFlashStage] = useState('idle');
  const [flashError, setFlashError] = useState(null);
  const [flashStartedAt, setFlashStartedAt] = useState(null);
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
    let stage = 'preparing';
    setFlashBusy(true); setFlashProgress(0); setFlashStage(stage); setFlashError(null); setFlashStartedAt(Date.now());
    setFlashLog([{ msg: 'Yazılım ESP32 belleğine aktarılıyor...', type: 'info', time: new Date().toLocaleTimeString('tr-TR') }]);
    try {
      const image = await prepareFirmware(selected, target.flashSizeKb);
      const live = await espJson(base, '/api/target/status', { timeoutMs: 6000 });
      if (!expectedUid || !live.connected || live.uid !== expectedUid) throw new Error('STM32 hedefi değişti; flash yapılmadı.');
      stage = 'uploading'; setFlashStage(stage);
      await espUpload(base, image);
      appendFlashLog(`Yazılım belleğe alındı. SWD Flash akışı başlıyor... (${selected.name}, ${image.size} bayt)`, 'success');
      stage = 'programming'; setFlashStage(stage);
      await espStream(base, '/stream-flash', (event) => {
        if (event.msg) appendFlashLog(event.msg, event.type || 'info');
        if (Number.isFinite(event.pct)) setFlashProgress(event.pct);
        if (event.pct >= 99) { stage = 'restarting'; setFlashStage(stage); }
        else if (Number.isFinite(event.pct)) { stage = 'programming'; setFlashStage(stage); }
      });
      setFlashStage('done'); setFlashProgress(100);
      appendFlashLog('STM32 başarıyla programlandı ve çalıştırıldı!', 'success');
      await refreshTargetAt(base);
      return true;
    } catch (error) { const detail = error?.message || String(error); setFlashStage('error'); setFlashError({ message: detail, stage }); appendFlashLog(`Hata: ${detail}`, 'error'); setNotice(`Flash başarısız: ${detail}`); return false; }
    finally { setFlashBusy(false); if (!parentLease) hardware.release(lease); }
  };
  return { firmware, setFirmware, flashLog, setFlashLog, flashProgress, flashBusy, flashFirmware, flashStage, flashError, flashStartedAt };
}
