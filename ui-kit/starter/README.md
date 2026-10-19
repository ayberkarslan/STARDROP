# YRT UI: bağımsız takvim örneği

Bu Vite + React projesi paket dışındaki bir uygulamanın `@stardrop/ui` bileşenlerini nasıl kullanacağını gösterir. Donanım, STARDROP servisleri veya ağ erişimi gerekmez.

```sh
npm install
npm run dev
```

`package.json` içindeki `file:..` bağımlılığı bir üst dizindeki `ui-kit` paketini kullanır. Örneği başka yere taşırsanız yolu yeni paket konumuna göre güncelleyin. Yerel pakette React'in tek kopyasını kullanmak için `vite.config.js` içindeki `preserveSymlinks` ve `dedupe` ayarları bulunur.

Örnek; panel, buton, sekme, boş durum, modal, metin alanı ve onay kutusu kullanımını içerir. Etkinlikler yalnız bellek içinde tutulur; gerçek uygulamada kalıcı veri katmanını siz eklersiniz.
