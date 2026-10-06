import { useEffect, useState } from 'react';

const stages = ['preparing', 'uploading', 'programming', 'restarting'];
const labels = ['Hazırla', 'ESP’ye aktar', 'Yaz ve doğrula', 'Başlat'];
const titles = { idle: 'Yüklemeye hazır', preparing: 'Dosya ve hedef kontrol ediliyor', uploading: 'ESP32’ye aktarılıyor',
  programming: 'Yazılıyor ve doğrulanıyor', restarting: 'STM32 başlatılıyor', done: 'Yükleme doğrulandı', error: 'Yükleme tamamlanamadı' };

export default function FlashProgress({ stage = 'idle', error, progress = 0, busy, startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    if (!busy) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [busy, startedAt]);
  const index = stage === 'done' ? stages.length : stages.indexOf(stage === 'error' ? error?.stage : stage);
  const indeterminate = busy && ['preparing', 'uploading'].includes(stage);
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  return <section className={`flash-progress-panel is-${stage}`} aria-label="Yükleme ilerlemesi" aria-busy={Boolean(busy)}>
    <div className="flash-progress-heading"><span role="status">{titles[stage] || titles.idle}</span><strong>{stage === 'idle' || indeterminate ? '—' : `${pct}%`}</strong></div>
    <div className={`flash-progress-track${indeterminate ? ' is-indeterminate' : ''}`} role="progressbar" aria-label="STM32 yükleme ilerlemesi"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate || stage === 'idle' ? undefined : pct} aria-valuetext={titles[stage]}>
      <i style={indeterminate ? undefined : { width: `${pct}%` }}/>
    </div>
    <ol className="flash-stage-list">{labels.map((label, i) => <li key={label} className={i < index ? 'is-done' : i === index ? stage === 'error' ? 'is-error' : 'is-active' : ''}><i aria-hidden="true"/><span>{label}</span></li>)}</ol>
    {startedAt && <small className="flash-elapsed">{elapsed} sn{busy ? ' · işlem sürüyor' : ''}</small>}
    {error && <div className="flash-failure" role="alert"><strong>{error.stage === 'preparing' ? 'STM32’ye yazma başlatılmadı.' : error.stage === 'uploading' ? 'Dosya aktarımı tamamlanmadı; STM32’ye yazma başlatılmadı.' : 'Tamamlandı onayı alınmadı; flash kısmen yazılmış olabilir.'}</strong>
      <p>{error.message}</p><small>{error.stage === 'preparing' ? 'Dosyanın hedef modele uygunluğunu ve bağlı kartın UID’sini kontrol et.' : error.stage === 'uploading' ? 'ESP32 bağlantısını kontrol edip tekrar dene.' : 'SWDIO, SWCLK, ortak GND ve hedef beslemesini kontrol et. Ayrıntılar terminalde; sistem kendiliğinden yeni yükleme başlatmaz.'}</small></div>}
  </section>;
}
