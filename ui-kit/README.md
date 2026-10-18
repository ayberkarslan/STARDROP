# STARDROP UI

Siyah/beyaz, masaüstü odaklı React arayüz parçaları. Vite için kaynak paketidir; önceden derleme gerekmez.

Yeni bir Vite/React projesinde:

```sh
npm install /home/ayberk/Projects/remotecode/ui-kit
```

```jsx
import { Button, Panel, TextField, SelectMenu } from '@stardrop/ui';
import '@stardrop/ui/styles.css';

function App() {
  return <Panel title="Yeni test" action={<Button variant="primary">Kaydet</Button>}>
    <TextField label="Test adı" placeholder="Örn. basınç testi" />
    <SelectMenu label="Kart" value="f446" options={[{ value: 'f446', label: 'STM32F446RE' }]} onChange={console.log} />
  </Panel>;
}
```

`Button`, `IconButton`, `ChoiceCard`, `Panel`, `StatusBadge`, `TextField` ve `SelectMenu` dışa açıktır. `Button` varyantları: `primary`, `secondary`, `ghost`, `danger`; boyutları: `sm`, `md`. `StatusBadge` tonları: `neutral`, `success`, `warning`, `danger`. İkonlar için kitaplık dayatılmaz; `children` olarak SVG veya Lucide bileşeni verilebilir.

Renk, radius, yazı tipi ve hareket değerleri `src/styles.css` içindeki `--sd-*` değişkenleridir. Yeni uygulamada bu değişkenleri kök CSS'te değiştirerek tema özelleştirilebilir. Michroma fontu ve lisansı paketin içindedir; internet bağlantısı gerekmez. Bileşenler global `button`, `input`, `body` stillerini değiştirmez; her sınıf `sd-` önekiyle ayrılır.

Bu paket arayüz katmanıdır. Ağ, SWD, dosya işlemleri ve uygulama durumu burada tutulmaz. Yeni ortak desenler gerçek ekranlarda kullanıldıkça pakete taşınır; ekranın iş mantığı kendi uygulamasında kalır.
