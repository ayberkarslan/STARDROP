import { useState } from 'react';
import { YRT_Button, YRT_ChoiceCard, YRT_Panel, YRT_SelectMenu, YRT_StatusBadge, YRT_TextField } from '@stardrop/ui';

const boards = [{ value: 'f446', label: 'STM32F446RE' }, { value: 'f401', label: 'STM32F401' }];

export default function App() {
  const [board, setBoard] = useState('f446');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  return <main className="starter">
    <header><span>YRT UI</span><YRT_StatusBadge tone={saved ? 'success' : 'neutral'}>{saved ? 'Kaydedildi' : 'Hazır'}</YRT_StatusBadge></header>
    <h1>Yeni test</h1>
    <p>Bu ekran yalnız ortak bileşenlerin kullanım örneğidir; donanım veya veri servisi içermez.</p>
    <YRT_Panel title="Test bilgileri" description="Ekranın iş mantığı uygulamada kalır." action={<YRT_Button size="sm" variant="ghost" onClick={() => { setName(''); setSaved(false); }}>Temizle</YRT_Button>}>
      <div className="starter-fields">
        <YRT_TextField label="Test adı" placeholder="Örn. basınç testi" value={name} onChange={event => { setName(event.target.value); setSaved(false); }}/>
        <div><label className="starter-label">Kart</label><YRT_SelectMenu label="Kart" value={board} options={boards} onChange={setBoard}/></div>
      </div>
      <YRT_Button variant="primary" disabled={!name.trim()} onClick={() => setSaved(true)}>Kaydet</YRT_Button>
    </YRT_Panel>
    <div className="starter-choices">
      <YRT_ChoiceCard onClick={() => setName('LED testi')}><span>LED testi</span><span>↗</span></YRT_ChoiceCard>
      <YRT_ChoiceCard onClick={() => setName('Basınç testi')}><span>Basınç testi</span><span>↗</span></YRT_ChoiceCard>
    </div>
  </main>;
}
