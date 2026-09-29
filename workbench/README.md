# STARDROP Desktop · geliştirme

`cd workbench && npm install && npm run tauri dev` uygulamayı açar. `npm run dev`
yalnız web önizlemesidir; ESP32 UDP keşfi, GitHub oturumu ve yerel derleme için
Tauri gerekir.

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

Kontroller: `npm run test:core`, `npm run test:firmware`, `npm run build`,
`cd src-tauri && cargo test --locked`.

Fiziksel bağlantı: ESP32 DevKit V1 GPIO18 → STM32 SWCLK, GPIO19 → SWDIO,
GND → GND. STM32 kendi 3,3 V kaynağıyla beslenebilir. Bu, iki sinyal hattı
**artı ortak GND** demektir.
