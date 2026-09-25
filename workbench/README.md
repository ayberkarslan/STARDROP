# STARDROP Desktop

Masaüstü uygulamasını açmak için `cd workbench && npm install && npm run tauri dev` kullan. Geliştirme sırasında yalnız React önizlemesi için `npm run dev` yeterlidir; GitHub Device Flow ve işletim sistemi kimlik bilgisi deposu gibi masaüstü özellikleri Tauri içinde çalışır.

İlk ekranda **Misafir olarak gir** seçeneği hesap gerektirmez. Masaüstü uygulaması açılışta LAN'a UDP keşif isteği gönderir, yanıt veren ESP32'yi HTTP `/ping` ile doğrular ve üst sağda aktif ağ/IP ile sinyal gücünü gösterir. STM32 SWD hedefi bulunmasa bile ESP32 bağlantısı ayrı olarak **bağlı** görünür. Kayıtlı adrese ve `192.168.4.1` AP adresine geri düşer; ayarlardan elle IP girmek de mümkündür. Masaüstündeki ESP HTTP istekleri ve yükleme akışları, webview'in yerel ağa erişim kısıtlarına takılmamak için Tauri'nin yerel ağ katmanından geçer. Bu katman `npm run tauri dev` ile çalışır; yalnız `npm run dev` ile açılan tarayıcı önizlemesinde UDP keşfi yoktur.

Programlayıcıda `.bin` veya STM32 için derlenmiş 32-bit little-endian ARM `.elf` seç. ELF, `0x08000000` tabanlı ham flash imajına dönüştürülür. Yükleme hedef firmware'ini siler ve ESP32 her bloğu geri okuyarak doğrular. Kart bilgileri ve ESP ayarları çekmeceleri, ESP'nin web arayüzündeki hedef adı/flash analizi, SWD hız profili ve Wi-Fi yönetimini sunar.

**GitHub ile devam et** sistem tarayıcısında GitHub App girişini açar; girişten sonra Workbench kart alanı kullanılabilir. Misafir için otomatik `.NET` pin analizi kullanıcı arayüzünde kapalıdır; bu bir sunucu tarafı yetkilendirme sınırı değildir.

## Yerel LED testi

1. GitHub ile giriş yap. Özel tanı deposu hazırsa Entegrasyonlar'da `owner/stardrop-diagnostics` ve `main` gir. Henüz depo yoksa yalnız `tauri dev` sırasında projenin `diagnostics/` klasörü geliştirici kaynağı olarak kullanılabilir; paketli uygulamada depo şarttır.
2. Kart Workbench'te manuel LED profili oluştur veya uygun profili içe aktar. STM32 parçasını, LED GPIO'sunu (BlackPill yerleşik LED için `PC13`), aktif düşük/yüksek polariteyi ve blink aralığını seç. Profili bağlı hedefin UID'siyle eşleştir; LED bağlantısını ayrıca onayla.
3. GitHub kaynak sürümünü kontrol et. İlk kullanımda **İndir ve etkinleştir** ile commit'i önbelleğe al; yeni commit'ler açık onayın olmadan etkinleşmez. Etkin kaynak daha sonra internet yokken de kullanılabilir.
4. **Yerelde derle ve yükle** düğmesinde mevcut STM32 yazılımının silineceğini onayla. Workbench `generated_config.h` üretir, aynı kaynağı seçilen pin/polarite/aralıkla bilgisayarda derler, `.bin` SHA-256 ve canlı UID kontrolünden sonra ESP32 SWD üzerinden yükler. `RUNNING` raporu yalnız kodun başladığını gösterir; LED'yi gözle değerlendirip sonucu **Evet/Hayır** ile kaydet. Test geçmişi `.stardrop` dışa aktarımına girer.

F401CC/CD/CE ve F446RE LED pilotunda desteklenir. Sensör şablonlarının Workbench'te yerel derlemesi henüz yoktur; sensör düğmeleri yanlış başarı göstermesin diye devre dışıdır. Misafir ve GitHub kullanıcıları Hızlı Yükleme ekranından hazır `.bin`/`.elf` yüklemeye devam edebilir.

Geliştirme sırasında BlackPill'in gerçek CubeMX/HAL projesini kullanmak için LED testi ekranındaki **Yerel BlackPill projesi** alanına `/home/ayberk/YRT_Projects/blackpill` klasörünü yaz. Bu makinede alan varsayılan olarak o klasörü gösterir. Workbench `stardrop-project.json` listesindeki kaynakları doğrudan ARM GCC ile derler; `Makefile` veya kaynak `build/` dizinini çalıştırmaz/değiştirmez. `pin_configurations.h` şeması proje içinde sabit, seçilen pin/polarite/zamanla doldurulmuş kopyası geçici derleme dizinindedir. Bu gerçek HAL projesi yalnız F401CC/CD ile uyumludur. Kodda SRAM tanı raporu olmadığından flash doğrulamasından sonra LED sonucunu kullanıcı gözle kaydeder. Alanı boşaltırsan önceki hafif tanı şablonu ve onun SRAM başlangıç raporu kullanılır.

Yerel klasör seçimi, GitHub kaynak indirme özelliğinden ayrıdır. BlackPill projesinin GitHub deposunu henüz Workbench'e bağlamadık; Entegrasyonlar'daki tanı deposu ayarı mevcut `diagnostics/` kataloğuna aittir. BlackPill deposu hazırlanıp GitHub App'e erişim verildiğinde ayrı bir kaynak adaptörü gerekecek. Bu ayrım, iki farklı depo biçiminin yanlışlıkla aynı derleme yoluymuş gibi görünmesini önler.

Paketleme sırasında `npm run prepare:toolchain` resmi ARM GNU Toolchain 14.3.rel1 arşivini indirir, sabit SHA-256 ile doğrular ve uygulamanın kaynaklarına ekler. Desteklenen paketleme makineleri x64 Linux ve x64 Windows'tur; geliştirme modunda sistemdeki `arm-none-eabi-gcc` yedek olarak kullanılabilir. İlk indirme ve paket boyutu büyüktür. Derleyici veya kaynak deposu bulunamadığında hedefe flash yapılmaz.

Geliştirme testleri: `npm run test:core`, `npm run test:firmware`, `npm run build` ve `cd src-tauri && cargo test --locked`.

Fiziksel bağlantı: ESP32 DevKit V1 GPIO18 → STM32 SWCLK, GPIO19 → SWDIO, GND → GND. STM32 kendi 3,3 V kaynağıyla beslenebilir; ESP32'nin 3,3 V hattını ayrıca bağlamak gerekmez. Reset hattı isteğe bağlıdır. Bu bağlantı iki sinyal hattı **artı ortak GND** demektir.
