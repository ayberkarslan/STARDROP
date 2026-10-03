# STARDROP Desktop · geliştirme

`cd workbench && npm install && npm run tauri dev` uygulamayı açar. `npm run dev`
yalnız web önizlemesidir; ESP32 UDP keşfi, GitHub oturumu ve yerel derleme için
Tauri gerekir.

GitHub giriş Worker'ına normal HTTPS/TCP bağlantısı ağda sıfırlanırsa masaüstü
uygulaması HTTP/3 yedek yolunu dener. Bunun için sistemde HTTP/3 destekli
`curl` bulunmalıdır (`curl -V` çıktısında `HTTP3` veya `ngtcp2`/`nghttp3`).
GitHub kodu ve yenileme token'ı komut satırı argümanına değil, yalnızca `curl`
standart girişine verilir. Normal HTTPS çalışan sistemlerde `curl` kullanılmaz.

**Misafir** yalnız Hızlı Yükleme'de hazır `.bin`/`.elf` seçip ESP32 üzerinden
STM32'ye gönderebilir. **GitHub ile giriş** Kart Workbench'i açar. Workbench'te
iki yol vardır: Altium `.NET` dosyasını yüklemek veya STM32/bileşeni elle
tanımlamak. Sonra bileşen → uygun test → pinout üzerinde bağlantı onayı →
yerel derleme/yükleme adımları izlenir. Test kodu henüz yoksa pinler incelenip
`.stardrop` projesine kaydedilebilir; yükleme açılmaz.

Pinout'un fiziksel bacak sırası `targets/packages.json` dosyasındadır. F401CC,
F401CD ve F401CE UFQFPN48 ile F446RE LQFP64 gösterilir. Aynı sürümlü veri,
arayüzde ve yerel derleyicinin pin doğrulamasında kullanılır. SWD pinleri,
pakette bulunmayan bacaklar ve geçersiz alternatif işlevler seçilemez. `.NET`
bulguları otomatik doldurulur ama kullanıcı onayı gerektirir; bağlantı tespiti
elektriksel uyumluluk veya sensör sağlığı kanıtı değildir.

Test deposunun v2 standardı `../code-repo/catalog/README.md` içindedir. v1
katalog okunmaya devam eder. Şu an doğrulanmış GitHub yerel HAL akışı yalnız
**STM32F401CC/CD LED blink** içindir. BHI360 örnek `.NET` dosyasında F446RE'ye
bağlı olarak algılanır ve v2 katalogda `planned` görünür; sensör firmware'i ve
F446 derleme desteği olmadığı için BHI360 testi henüz çalıştırılamaz. Flash
yazma doğrulaması sensör testi PASS anlamına gelmez. ESP firmware'i ve mevcut
iki sinyalli SWD bağlantısı bu aşamada değiştirilmedi.

**Test Kütüphanesi:** GitHub oturumuyla kart profilini ve bileşen pinlerini
onayladıktan sonra kütüphanede bir ad (isteğe bağlı atölye notu) girip
GitHub'a kaydedebilirsin. Uygulama `library/<UUID>.json` bilgi dosyasını
kendisi oluşturur: MCU, modül, pinler, test kimliği/kaynak commit'i ve varsa
son doğrulanmış test sonucu. UID ve ham `.NET` dosyası paylaşılmaz. Test kodu
henüz yoksa bağlantı düzeni `planned` olarak kaydedilebilir; PASS gösterilmez.
Arama kart, sensör, pin ve test adına bakar. Kaydı açmak yalnız profili yükler;
canlı hedef ve pinler yeniden onaylanır. Paylaşım için test deposunda
`Contents: Read and write` izni gerekir; okuma için `Contents: Read` yeterlidir.
Kayıtlar ayrı dosyalardır, böylece üyeler birbirinin kataloğunu değiştirmeden
ekleme yapabilir. Bu prototipte dizin 1000 kayıtla sınırlıdır.

Kontroller: `npm run test:core`, `npm run test:firmware`, `npm run build`,
`cd src-tauri && cargo test --locked`.

Fiziksel bağlantı: ESP32 DevKit V1 GPIO18 → STM32 SWCLK, GPIO19 → SWDIO,
GND → GND. STM32 kendi 3,3 V kaynağıyla beslenebilir. Bu, iki sinyal hattı
**artı ortak GND** demektir.
