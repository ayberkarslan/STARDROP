import { useState } from 'react';
import { Button, ChoiceCard, Panel, SelectMenu, StatusBadge, TextField } from '@stardrop/ui';

const boards = [{ value: 'f446', label: 'STM32F446RE' }, { value: 'f401', label: 'STM32F401' }];

export default function App() {
  const [board, setBoard] = useState('f446');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  return <main className="starter">
    <header><span>STARDROP UI</span><StatusBadge tone={saved ? 'success' : 'neutral'}>{saved ? 'Kaydedildi' : 'Hazır'}</StatusBadge></header>
    <h1>Yeni test</h1>
    <p>Bu ekran yalnız ortak bileşenlerin kullanım örneğidir; donanım veya veri servisi içermez.</p>
    <Panel title="Test bilgileri" description="Ekranın iş mantığı uygulamada kalır." action={<Button size="sm" variant="ghost" onClick={() => { setName(''); setSaved(false); }}>Temizle</Button>}>
      <div className="starter-fields">
        <TextField label="Test adı" placeholder="Örn. basınç testi" value={name} onChange={event => { setName(event.target.value); setSaved(false); }}/>
        <div><label className="starter-label">Kart</label><SelectMenu label="Kart" value={board} options={boards} onChange={setBoard}/></div>
      </div>
      <Button variant="primary" disabled={!name.trim()} onClick={() => setSaved(true)}>Kaydet</Button>
    </Panel>
    <div className="starter-choices">
      <ChoiceCard onClick={() => setName('LED testi')}><span>LED testi</span><span>↗</span></ChoiceCard>
      <ChoiceCard onClick={() => setName('Basınç testi')}><span>Basınç testi</span><span>↗</span></ChoiceCard>
    </div>
  </main>;
}
