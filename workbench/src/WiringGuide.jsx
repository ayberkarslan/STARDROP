import { useState } from 'react';
import { ArrowLeft, Expand, X } from 'lucide-react';
import Popup from './Popup.jsx';
import SelectMenu from './SelectMenu.jsx';
import { ESP_WIRING_PROFILES, WIRING_BOARDS, WIRING_MCUS, guideMcu, wiringRows } from './lib/wiringGuide.js';
import nucleoPinout from './assets/nucleo-f446re-pinout.png';

export default function WiringGuide({ programmer, online, target, onClose }) {
  const live = online && Number.isInteger(programmer?.swdioPin) && Number.isInteger(programmer?.swclkPin);
  const [espProfile, setEspProfile] = useState(live ? 'live' : 's3');
  const [board, setBoard] = useState(String(target?.model || '').startsWith('STM32F401') ? 'custom' : 'nucleo');
  const [mcu, setMcu] = useState(guideMcu(target?.model));
  const [pinoutFull, setPinoutFull] = useState(false);
  const rows = wiringRows({ programmer, espProfile, board, mcu });
  if (pinoutFull) return <Popup className="wiring-pinout-preview" ariaLabel="Nucleo F446RE pinout" onClose={onClose}>
    <div className="wiring-title"><button className="wizard-text-button" onClick={() => setPinoutFull(false)}><ArrowLeft size={16}/>Rehbere dön</button><button className="icon-button" aria-label="Rehberi kapat" onClick={onClose}><X size={18}/></button></div>
    <h2>Nucleo F446RE · CN7</h2>
    <div className="wiring-pinout-scroll"><img src={nucleoPinout} alt="Nucleo F446RE pinout: CN7 pin 13 SWDIO PA13, pin 15 SWCLK PA14, pin 19 GND, pin 14 RESET"/></div>
    <p className="wiring-board-note">SWDIO 13 · SWCLK 15 · GND 19 · NRST 14. Numara, CN7 başlığına aittir; MCU bacağına değil.</p>
  </Popup>;
  return <Popup className="wiring-guide" ariaLabel="SWD bağlantı rehberi" onClose={onClose}>
    <div className="wiring-title"><div><small>ESP32 → STM32</small><h2>Bağlantı rehberi</h2></div><button className="icon-button" aria-label="Rehberi kapat" onClick={onClose}><X size={18}/></button></div>
    <div className="wiring-selectors">
      <label>ESP32<SelectMenu ariaLabel="Rehber ESP32 profili" value={espProfile} options={[...(live ? [{ value: 'live', label: 'Bağlı ESP32 · firmware pinleri' }] : []), ...ESP_WIRING_PROFILES]} onChange={setEspProfile}/></label>
      <label>Hedef kart<SelectMenu ariaLabel="Rehber hedef kartı" value={board} options={WIRING_BOARDS} onChange={value => { setBoard(value); if (value === 'blackpill' && !mcu.startsWith('STM32F401')) setMcu('STM32F401CCU6'); }}/></label>
      {board !== 'nucleo' && <label>STM32 modeli<SelectMenu ariaLabel="Rehber STM32 modeli" value={mcu} options={board === 'blackpill' ? WIRING_MCUS.filter(item => item.value.startsWith('STM32F401')) : WIRING_MCUS} onChange={setMcu}/></label>}
    </div>
    <p className="wiring-profile-note">{espProfile === 'live' ? online ? 'ESP pinleri bağlı cihazdan okunuyor.' : 'Bağlantı kesildi; son bildirilen ESP pinleri gösteriliyor.' : 'ESP pinleri bu projenin seçili firmware profiline göre. Farklı firmware kullanıyorsan kontrol et.'} Kart tipi otomatik belirlenmez.</p>
    <div className="wiring-map" role="table" aria-label="ESP32 ile STM32 kablo eşleştirmeleri">
      <div className="wiring-map-heading" role="row"><span role="columnheader">ESP32</span><span role="columnheader">Kablo</span><span role="columnheader">STM32</span></div>
      {rows.map(row => <div className={'wiring-row' + (row.optional ? ' wiring-optional' : '')} role="row" key={row.signal}>
        <strong role="cell">{row.esp}</strong><span className="wiring-wire" role="cell"><i/>{row.signal}<i/>{row.optional && <small>isteğe bağlı</small>}</span><span role="cell"><strong>{row.stm}</strong><small>{row.location}</small></span>
      </div>)}
    </div>
    {board === 'nucleo' && <details className="wiring-pinout">
      <summary>Kart üzerinde göster <span>F446RE pinout</span></summary>
      <figure><img src={nucleoPinout} alt="Nucleo F446RE kart başlıkları ve işaretli SWDIO, SWCLK bağlantıları" loading="lazy"/><figcaption>CN7: SWDIO 13 · SWCLK 15 · GND 19 · NRST 14</figcaption></figure>
      <button className="secondary" onClick={() => setPinoutFull(true)}><Expand size={14}/>Büyük göster</button>
    </details>}
    {board === 'blackpill' && <p className="wiring-board-note">Klonlarda başlık yönü değişebilir. DIO / IO ve CLK baskılarını kontrol et; çizimdeki sıra fiziksel başlık sırası değildir. NRST için karttaki reset noktasını kullan.</p>}
    {board === 'custom' && <p className="wiring-board-note">Bacak numarası seçili MCU paketine aittir; PCB konektörünün pin numarası değildir. Şemanda PA13, PA14 ve NRST hatlarının çıktığı test noktalarını bul.</p>}
    <details className="wiring-troubleshooting"><summary>Hedef görünmüyorsa</summary><p>Önce ortak GND ve kartın beslemesini kontrol et. IO ile CLK yer değiştirmiş olmasın; kablolar kısa ve temas sağlam olsun. Nucleo’da CN2 jumper’larını çıkar. Gerekirse SAFE hızını seç; kilitli hedefte NRST gerekebilir.</p></details>
  </Popup>;
}
