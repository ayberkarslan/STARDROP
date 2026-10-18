# Vite başlangıcı

Bu klasörde `npm install` ardından `npm run dev` yeterli. `@stardrop/ui` üst dizindeki paketten alınır. Başka bir konuma kopyalarsan `package.json` içindeki `file:..` yolunu yeni paket yoluna göre güncelle veya `npm install /paketin/tam/yolu` çalıştır.

Yerel `file:` bağımlılığı npm tarafından sembolik bağlantı olarak kurulabilir. `vite.config.js` içindeki `preserveSymlinks` ve React `dedupe` ayarları paketin uygulamanın React kopyasını kullanmasını sağlar; yeni projede yerel paket kullanırken bu ayarları koru.

`src/App.jsx` yalnız UI örneğidir. Gerçek veri akışı, durum yönetimi ve donanım işlemleri yeni uygulamaya aittir.
