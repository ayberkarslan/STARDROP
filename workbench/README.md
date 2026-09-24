# STARDROP Desktop

Masaüstü uygulamasını açmak için `cd workbench && npm install && npm run tauri dev` kullan. Geliştirme sırasında yalnız React önizlemesi için `npm run dev` yeterlidir; GitHub Device Flow ve işletim sistemi kimlik bilgisi deposu gibi masaüstü özellikleri Tauri içinde çalışır.

İlk ekranda **Misafir olarak gir** seçeneği hesap gerektirmez. Programlayıcıda ESP32 adresini girip hedefi yenile; `.bin` veya STM32 için derlenmiş 32-bit little-endian ARM `.elf` seç. ELF, `0x08000000` tabanlı ham flash imajına dönüştürülür. Yükleme hedef firmware'ini siler ve ESP32 her bloğu geri okuyarak doğrular. Kart bilgileri ve ESP ayarları çekmeceleri, ESP'nin web arayüzündeki hedef adı/flash analizi, SWD hız profili ve Wi-Fi yönetimini sunar.

**GitHub ile devam et** gerçek GitHub Device Flow kullanır. Henüz bir GitHub App Client ID ve tanı kodu deposu yapılandırılmadığı için ilk kullanımda Client ID girilmesi gerekir. GitHub oturumu Workbench sekmesini açar; testlerin gerçekten çalışması için ayrıca özel depo kataloğu ve derleme iş akışı gerekir. Misafir için otomatik `.NET` pin analizi kullanıcı arayüzünde kapalıdır; bu bir sunucu tarafı yetkilendirme sınırı değildir.

Geliştirme testleri: `npm run test:core`, `npm run test:firmware`, `npm run build` ve `cd src-tauri && cargo check --locked`.

Fiziksel bağlantı: ESP32 DevKit V1 GPIO18 → STM32 SWCLK, GPIO19 → SWDIO, GND → GND. STM32 kendi 3,3 V kaynağıyla beslenebilir; ESP32'nin 3,3 V hattını ayrıca bağlamak gerekmez. Reset hattı isteğe bağlıdır. Bu bağlantı iki sinyal hattı **artı ortak GND** demektir.
