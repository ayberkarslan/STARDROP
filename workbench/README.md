# STARDROP Desktop · geliştirme

`cd workbench && npm install && npm run tauri dev` uygulamayı açar. `npm run dev`
yalnız web önizlemesidir; ESP32 UDP keşfi, GitHub oturumu ve yerel derleme için
Tauri gerekir.

## Canlı cihaz bağlantısı

Kart adları bilgisayarın uygulama veri dizinindeki `targets.json` dosyasına
UID anahtarıyla kaydedilir (Linux: `~/.local/share/com.yildizroket.stardrop-workbench/targets.json`).
Aynı model iki farklı kartın adı birbirine karışmaz. Uygulamayı yeniden açmak,
STM flashını silmek veya ESP'yi değiştirmek bu yerel kaydı silmez. Yerel ad
ESP'den gelen ada göre önceliklidir; eski ESP adları ilk görülünce içeri
alınır. Ad değiştirmek ESP'ye veya STM flashına yazmaz. Kayıt atomik dosya
değişimiyle yapılır; bozuk kayıt sessizce boş veriyle ezilmez. Bu şimdilik
dosya tabanlı yerel kayıttır, bulut/ekip senkronizasyonu değildir.

Yeni ESP firmware'i `statusEventsAvailable` özelliğiyle UDP 4210 üzerinden
bağlantı değişikliklerini bildirir. Masaüstü uygulaması dinler; bağlıyken
periyodik HTTP/SWD hedef sorgusu göndermez. ESP, yalnız izleyici varken ve
boştayken 1,5 saniyede bir pasif SWD kimlik kontrolü yapar. CPU resetlenmez,
halt edilmez; iki başarısız kontrol bağlantı kopması sayılır. Yükleme, flash
analizi ve bakım sırasında izleyici kapatılır, işlemden sonra tekrar açılır.
Üç saniyelik küçük UDP canlılık paketleri bağlantı kesilmesini belirler;
aynı durum arayüze tekrar gönderilmez. ESP on saniye sessiz kalırsa çevrimdışı
gösterilir ve yeniden keşfedilir. Eski firmware yalnız ağ sağlık kontrolünü
destekler; otomatik STM bildirimi için firmware güncellemesi gerekir:

```sh
pio run -e esp32-s3-n16r8 -t upload
```

Bu komut ESP32-S3 N16R8 içindir; başka ESP modeli için kendi ortamını seç.
Native izleme komutlarının kullanılabilmesi için Tauri uygulamasını da yeniden
başlat. Simüle bağlantı testi `tools/status-events-smoke.mjs` içindedir.

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

GitHub girişi artık Device Flow kullanır: uygulama kodu kendi penceresinde
gösterir; kullanıcı kodu yalnız GitHub'ın `github.com/login/device` sayfasında
onaylar. GitHub App → General → **Enable Device Flow** açık olmalıdır. Bu akış
`workers.dev` adresine, callback'e veya client secret'ın masaüstüne konmasına
ihtiyaç duymaz. Device Flow ile açılan oturumun yenilemesi de doğrudan GitHub'da
yapılır. Eski tarayıcı/Worker akışı yalnız önceki oturumların yenilenmesi için
kodda tutulmuştur.

Pinout'un fiziksel bacak sırası `targets/packages.json` dosyasındadır. F401CC,
F401CD ve F401CE UFQFPN48 ile F446RE LQFP64 gösterilir. Aynı sürümlü veri,
arayüzde ve yerel derleyicinin pin doğrulamasında kullanılır. SWD pinleri,
pakette bulunmayan bacaklar ve geçersiz alternatif işlevler seçilemez. `.NET`
bulguları otomatik doldurulur ama kullanıcı onayı gerektirir; bağlantı tespiti
elektriksel uyumluluk veya sensör sağlığı kanıtı değildir.

Test deposunun v2 standardı `../code-repo/catalog/README.md` içindedir. v1
katalog okunmaya devam eder. GitHub yerel HAL akışı
**STM32F401CC/CD ve STM32F446RE LED blink** için derleme testlerinden geçti.
Pin, geçiş aralığı ve LED yönü geçici `pin_configurations.h` ile değiştirilir;
temiz GitHub test arşivi `../code-repo/` içindedir. BHI360 örnek `.NET` dosyasında F446RE'ye
bağlı olarak algılanır ve v2 katalogda `planned` görünür; sensör firmware'i ve
sensör sürücüsü hazır olmadığı için BHI360 testi henüz çalıştırılamaz. Flash
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

### Çalışma sekmeleri

Michroma fontu uygulamayla birlikte gelir; çevrimdışı da yüklenir. Terminal ve
kod çıktıları okunabilirlik için eş aralıklı font kullanır. Boş sekmede giriş
ekranı görünür; STARDROP yazısı bu ekranın başında yer alır. Soldaki araçları
sekme başlığına veya çalışma alanına sürükleyip
bırakabilirsin; boş veya dolu sekmenin içeriği seçtiğin araca dönüşür. Sekme
başlığını sürüklemek sıralamayı değiştirir; Escape sürüklemeyi iptal eder.

Yeni sekme açıp Yeni Test’i üzerine bırakınca bağımsız bir test başlatılır.
Kart, pinler, dosyalar, derleme/yükleme günlüğü ve test geçmişi o çalışmaya aittir.
Menüye normal tıklamak açık olan aracı öne getirir. Kapatılan veya değiştirilmiş
çalışmayı bildirim merkezindeki “Son taslağı geri aç” ile geri açabilirsin.
Taslaklar yalnız mevcut uygulama oturumunun belleğinde korunur; kalıcı saklama
için `.stardrop` dışa aktarmayı kullan. GitHub çıkışı çalışma oturumlarını temizler.

ESP/SWD üzerinde aynı anda tek işlem çalışır. İşlem sahibi sekme kapatılamaz veya
başka araca dönüştürülemez; diğer testlerin hazırlığı devam edebilir. Yüklemeden
önce canlı STM32 UID’si yeniden kontrol edilir. Ayarlar ve kaynak kataloğu
uygulama genelindeki ortak tercihlerdir; test kütüphanesinde paylaşılacak çalışma
ayrıca seçilir.

Sekme/donanım kilidi kontrolleri: `npm run test:ui`. Tarayıcı kontrolleri için
Playwright kurulu bir ortamda `node tools/workspace-smoke.mjs` çalıştırılabilir.
İsteğe bağlı `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` ve `UI_URL` değişkenleri
desteklenir. Bu kontrol GitHub ve ESP’yi taklit eder; gerçek donanıma yazmaz.

Fiziksel bağlantı: ESP32 DevKit V1 GPIO18 → STM32 SWCLK, GPIO19 → SWDIO,
GND → GND. STM32 kendi 3,3 V kaynağıyla beslenebilir. Bu, iki sinyal hattı
**artı ortak GND** demektir.
