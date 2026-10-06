# Ayarlar

Arama bölüm adlarında ve anahtar sözcüklerde çalışır. Tek bölüm görünür; test ve donanım ekranları değişmez.

- Sistem kontrolü: gerçek derleyici araçları, depo erişimi, mevcut kaynak, ESP/STM bağlantısı ve telemetri desteği. Kod hazırlama ile yükleme ayrı değerlendirilir.
- Test kaynakları: depo/dal, erişim tanısı, kaynak sürümleri, indirme ve önbellek. Depo değişikliği açıkça kaydedilir; her tuşta ağ isteği yapılmaz. Önbellek temizleme yalnız seçilen depoyu arşive taşır, kart kayıtlarını silmez.
- Atölye: UID ile kart isimleri ve son flash analizleri, açık test profilleri ve tercihler JSON olarak yedeklenir. Kaynak kodu ve anahtarlar yedeğe girmez. Geri yükleme diğer kartları korur, aynı UID'yi günceller; profiller yeni sekmelerde açılır, hedef bağı ve pin onayları sıfırlanır.
- Ölçüm: yeni oturumun varsayılan aralığı ve kayıt limiti, CSV/rapor/yedek klasörü, sıcaklık ve basınç birimi. Birimler görüntüye uygulanır; CSV ham değer ve birimi korur. Devam eden okumanın aralığı ayar değişimiyle değiştirilmez.
- Güvenlik: güvenilir test deposu seçimi; UID, kaynak bütünlüğü ve telemetri doğrulamaları kapatılamaz.
- Görünüm: yazı boyutu, arayüz ölçeği, azaltılmış hareket ve giriş sonrası ilk ekran. Siyah tema korunur.
- Tanılama: uygulama/araç sürümleri ve son bildirimlerle JSON raporu. Bilinen anahtar biçimleri, token alanları ve callback kodları rapordan ayıklanır.

## Depo anahtarı

“Bu bilgisayarda hatırla” açıkken PAT işletim sisteminin kalıcı güvenli kasasına yazılır. Windows Credential Manager, macOS Keychain, Linux Secret Service kullanılır. Linux'ta Secret Service/uygun kasa çalışmalı ve açık olmalıdır. Kasa yoksa veya erişilemiyorsa uygulama anahtarı yalnız oturum belleğinde tutar ve bunu açıkça gösterir; şifresiz dosyaya geçmez.

Tercih kapatıldığında bilinen kalıcı kayıt silinmeden başarı gösterilmez. GitHub oturumundan çıkmak hatırlanan depo anahtarını silmez; “Anahtarı unut” kalıcı kaydı ve belleği siler. Anahtar localStorage'a, yedeğe ve proje arşivine yazılmaz. Yeni native bağımlılığın etkinleşmesi için çalışan Tauri geliştirme sürecini yeniden başlat.

## Kontrol

`npm run test:settings` saf ayar/yedek/redaksiyon testlerini çalıştırır. `tools/settings-smoke.mjs` Playwright ile arama, siyah yüzeyler, yeniden açılış, hatırlama kapatma, yedek ve raporu test eder; native kasa bu UI testinde taklittir. Gerçek kasa erişimi cihaz/OS koşuluna bağlıdır. `cargo test --lib --offline` kayıt birleştirme ve derleme testlerini içerir. Donanıma yazma/silme bu ayar testlerinde yapılmaz.
