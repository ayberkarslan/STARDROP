import { ArrowUpRight, BookOpen, FlaskConical } from 'lucide-react';
import { ChoiceCard } from '@stardrop/ui';

export default function TestHome({ startNewTest, openLibrary }) {
  return <div className="test-home workspace">
    <div className="test-home-inner">
      <span className="eyebrow">TESTLER</span>
      <h1>Nasıl başlamak istersin?</h1>
      <p>Kendi testini oluştur veya ekibin kaydettiği testlerden devam et.</p>
      <div className="test-home-choices">
        <ChoiceCard onClick={startNewTest}>
          <FlaskConical size={22} strokeWidth={1.5}/>
          <span><strong>Yeni test oluştur</strong><small>Kartı, bileşeni ve pinleri seç.</small></span>
          <ArrowUpRight size={18} strokeWidth={1.5}/>
        </ChoiceCard>
        <ChoiceCard onClick={openLibrary}>
          <BookOpen size={22} strokeWidth={1.5}/>
          <span><strong>Test Kütüphanesi</strong><small>Kaydedilmiş testleri bul ve aç.</small></span>
          <ArrowUpRight size={18} strokeWidth={1.5}/>
        </ChoiceCard>
      </div>
    </div>
  </div>;
}
