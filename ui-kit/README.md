# YRT UI

Siyah/beyaz, masaüstü odaklı React arayüz parçaları. Vite için kaynak paketidir; önceden derleme gerekmez.

Yeni bir Vite/React projesinde:

```sh
npm install /home/ayberk/Projects/remotecode/ui-kit
```

Çalışan başlangıç örneği `starter/` klasöründe. Yerel `file:` kurulumlarında npm paketi sembolik bağlantı yaparsa örnekteki `vite.config.js` ayarlarını (`preserveSymlinks`, React `dedupe`) kullan.

```jsx
import { YRT_Button, YRT_Panel, YRT_TextField, YRT_SelectMenu } from '@stardrop/ui';
import '@stardrop/ui/styles.css';

function App() {
  return <YRT_Panel title="Yeni test" action={<YRT_Button variant="primary">Kaydet</YRT_Button>}>
    <YRT_TextField label="Test adı" placeholder="Örn. basınç testi" />
    <YRT_SelectMenu label="Kart" value="f446" options={[{ value: 'f446', label: 'STM32F446RE' }]} onChange={console.log} />
  </YRT_Panel>;
}
```

Takım standardı olan dışa açık adlar `YRT_Button`, `YRT_IconButton`, `YRT_ChoiceCard`, `YRT_BackArrow`, `YRT_Panel`, `YRT_StatusBadge`, `YRT_TextField` ve `YRT_SelectMenu` şeklindedir. Eski kısa adlar mevcut ekranları kırmamak için geçici uyumluluk takma adlarıdır. `YRT_Button` varyantları: `primary`, `secondary`, `ghost`, `danger`; boyutları: `sm`, `md`. `YRT_StatusBadge` tonları: `neutral`, `success`, `warning`, `danger`. İkonlar için kitaplık dayatılmaz; `children` olarak SVG veya Lucide bileşeni verilebilir.

Renk, radius, yazı tipi ve hareket değerleri `src/styles.css` içindeki `--sd-*` değişkenleridir. Yeni uygulamada bu değişkenleri kök CSS'te değiştirerek tema özelleştirilebilir. Michroma fontu ve lisansı paketin içindedir; internet bağlantısı gerekmez. Bileşenler global `button`, `input`, `body` stillerini değiştirmez; her sınıf `sd-` önekiyle ayrılır.

Bu paket arayüz katmanıdır. Ağ, SWD, dosya işlemleri ve uygulama durumu burada tutulmaz. Yeni ortak desenler gerçek ekranlarda kullanıldıkça pakete taşınır; ekranın iş mantığı kendi uygulamasında kalır.
