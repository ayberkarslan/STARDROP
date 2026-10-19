# YRT UI

Siyah zemin, yüksek kontrast, ince çizgiler ve Michroma tipografisiyle oluşturulmuş genel amaçlı React bileşen kütüphanesi. Takvim, görev yöneticisi, kontrol paneli veya masaüstü uygulamasında kullanılabilir; donanım veya STARDROP bağımlılığı yoktur.

## Kurulum

Paket henüz npm kayıt sisteminde yayımlanmıyor. `ui-kit/` klasörünü yeni projenin yanına kopyalayın veya Git üzerinden erişilebilir tutun. Vite + React projenizde:

```sh
npm install /paketin/bulundugu/yer/ui-kit
```

Örneğin proje dizini `~/Projects/calendar-app`, paket dizini `~/Projects/yrt-ui/ui-kit` ise `npm install ~/Projects/yrt-ui/ui-kit` çalıştırın. `package.json` bağımlılığı yerel `file:` yolunu gösterir; bu yol başka bilgisayarda da mevcut olmalıdır. Dağıtılabilir bir uygulama üretirken paketi projenin yanında saklamak veya sürümlü Git bağımlılığına dönüştürmek daha güvenlidir. React 18/19 gerekir.

Tek dosya olarak taşımak isterseniz paket klasöründe `npm pack` çalıştırın; oluşan `stardrop-ui-0.2.0.tgz` dosyasını yeni projeye taşıyıp `npm install ./stardrop-ui-0.2.0.tgz` ile kurun. Bu yöntem kaynak klasörünün aynı bilgisayarda bulunmasını gerektirmez.

Yerel npm bağlantısı React'i iki kez yüklerse Vite ayarına şunu ekleyin:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { preserveSymlinks: true, dedupe: ['react', 'react-dom'] },
});
```

## İlk ekran

`src/main.jsx` içinde CSS'i bir kez yükleyin:

```jsx
import '@stardrop/ui/styles.css';
import './app.css';
```

Kütüphane `body` veya genel `button` stillerini değiştirmez. Uygulamanızın zeminini kendiniz belirleyin:

```css
body { margin: 0; background: var(--sd-black); color: var(--sd-white); font-family: var(--sd-font); }
```

Basit bir takvim ekranı:

```jsx
import { useState } from 'react';
import { YRT_Button, YRT_Dialog, YRT_EmptyState, YRT_Panel, YRT_TextField } from '@stardrop/ui';

export default function App() {
  const [open, setOpen] = useState(false);
  const [eventName, setEventName] = useState('');
  const [events, setEvents] = useState([]);

  return <main className="app">
    <YRT_Panel title="Takvim" action={<YRT_Button variant="primary" onClick={() => setOpen(true)}>Etkinlik ekle</YRT_Button>}>
      {events.length ? events.map((event, index) => <p key={index}>{event}</p>)
        : <YRT_EmptyState title="Henüz etkinlik yok" description="İlk etkinliğini ekleyerek başla." />}
    </YRT_Panel>
    <YRT_Dialog open={open} onClose={() => setOpen(false)} title="Yeni etkinlik"
      actions={<YRT_Button variant="primary" disabled={!eventName.trim()} onClick={() => {
        setEvents(current => [...current, eventName.trim()]); setEventName(''); setOpen(false);
      }}>Kaydet</YRT_Button>}>
      <YRT_TextField label="Etkinlik adı" value={eventName} onChange={event => setEventName(event.target.value)} />
    </YRT_Dialog>
  </main>;
}
```

## Bileşenler

| Bileşen | Kullanım |
| --- | --- |
| `YRT_Button`, `YRT_IconButton`, `YRT_ChoiceCard` | Eylem ve seçim kartları |
| `YRT_Panel`, `YRT_Disclosure`, `YRT_Dialog` | İçerik, açılır ayrıntı, modal |
| `YRT_TextField`, `YRT_TextArea`, `YRT_Checkbox`, `YRT_SelectMenu` | Form alanları |
| `YRT_Tabs` | Sekmeli içerik (`items`: `value`, `label`, `content`) |
| `YRT_StatusBadge`, `YRT_EmptyState` | Durum ve boş liste ekranı |
| `YRT_BackArrow`, `YRT_Showcase` | Geri gezinme ve görsel sunumu |

`YRT_Button` varyantları `primary`, `secondary`, `ghost`, `bare`, `danger`; boyutları `sm`, `md`. İkon için SVG veya istediğiniz React ikon bileşenini `children` olarak verin; ikon paketi zorunlu değildir. `YRT_Tabs` hem kendi durumunu tutabilir (`defaultValue`) hem de `value`/`onChange` ile kontrol edilebilir. `YRT_Dialog` kontrollüdür: `open` ve `onClose` verin. Bileşenlerin TypeScript tanımları `src/index.d.ts` içindedir.

## Tasarım ve sınırlar

Renk, çizgi, köşe, yazı tipi ve geçiş değerleri `src/styles.css` içindeki `--sd-*` değişkenleridir. Kendi CSS'inizde `:root` altında geçersiz kılabilirsiniz. Michroma fontu ve lisansı paketin içinde gelir; çevrimiçi font çağrısı yoktur. Bileşen sınıfları `sd-` öneklidir. Yalnız bileşenleri ve tasarım dilini paylaşır: takvim verisi, ağ istekleri, dosya erişimi, yönlendirme ve uygulama durumu sizin projenizde kalır.

Çalışan bağımsız örnek `starter/` klasöründedir: orada `npm install` ve `npm run dev` yeterli.
