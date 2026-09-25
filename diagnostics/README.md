# STARDROP Diagnostics

Bu klasör, özel `stardrop-diagnostics` GitHub deposunun başlangıç içeriğidir.
Ana ESP32/Workbench deposundan bağımsız sürümlenmelidir.

## İçerik

- `runtime/`: SWD ile okunabilen, sürümlü SRAM rapor ABI'si.
- `catalog/`: Stable/dev artifact manifestinin kaynak şeması.
- `templates/`: Her sensör için `diagnostic_run()` uygulayan küçük C dosyaları.
- `firmware/`: Ortak Cortex-M4 başlangıç kodu, yazılımsal I²C ve SRAM raporu.
- `boards/`: İncelenmiş kart profilleri.
- `.github/workflows/`: kaynak/test doğrulaması ve isteğe bağlı audit işi. Kart başına bulut derlemesi yoktur.

## GitHub kurulumu

1. Bu klasörü ayrı bir özel `stardrop-diagnostics` deposuna koyun ve `main` dalını açın. Workbench'te Entegrasyonlar alanına `owner/stardrop-diagnostics` yazın.
2. STARDROP GitHub App'i bu depoya kurun. Giriş için GitHub App kullanıcı yetkilendirmesi, kaynak okumak için `Contents: read`, katalogu Workbench'ten düzenlemek isteyen yöneticiler için `Contents: write` gerekir. Kullanıcıların tamamına yazma yetkisi vermeyin; mevcut prototipte yönetici arayüzü GitHub yetkisini kontrol etse de ayrıca bir sunucu tarafı rol katmanı bulunmaz.
3. İsteğe bağlı `audit-event.yml` kullanacaksanız yöneticiye özel `stardrop-audit` deposunu, `AUDIT_REPOSITORY` variable'ını ve bu depoya yalnız issue yazabilen `AUDIT_TOKEN` secret'ını ayrıca kurun. LED testi bunlara bağlı değildir.

Kart profili, canlı SWD hedefinin UID'siyle kullanıcı tarafından eşleştirilir. Workbench seçilen GitHub commit'ini yerel önbelleğe indirir, `generated_config.h` dosyasını onaylı profil pinlerinden üretir ve firmware'i bilgisayarda derler. `.NET`, PDF, API anahtarı ve kart profili GitHub Actions'a gönderilmez. Yeni commit otomatik etkinleşmez; Workbench'teki sürüm onayı gerekir. Çevrimdışıyken son etkin kaynakla derleme yapılabilir.

## Çalışan prototip kapsamı

Workbench'teki uçtan uca yerel derleme pilotu F401CC/CD/CE ve F446RE için LED blink testidir. GPIO, polarite ve 50–5000 ms blink aralığı profilden gelir; LED'nin gerçekten yanıp söndüğüne operatör karar verir. STM32 SRAM raporundaki `RUNNING`, firmware'in başladığını doğrular ama LED donanımının sağlamlığını kanıtlamaz. BMP180 ve MCU self-test şablonları komut satırında derlenir; Workbench sensör testleri henüz yerel derleme akışına taşınmadığı için UI'de kapalıdır. Genel I²C ACK taraması yalnız geliştirici bus teşhisidir. BMP180 ham ADC sayısı gerçek sıcaklık değildir. MS5611, BMP388, ICM20689 ve SPI testleri `planned` durumundadır.

I²C tanı firmware'i yazılımsal (bit-bang) bus kullanır. Profilde aynı bus etiketiyle `SOFT_I2C_1` seçilirse MCU paketinde mevcut ve SWD için ayrılmamış GPIO çiftleri kullanılabilir; gerçek kartta doğru voltaj ve pull-up dirençleri hâlâ gereklidir.

Yerel derleme kontrolü:

```sh
node tools/build-firmware.mjs tests/valid-profile.json U1 bmp180 build/f401 local-f401
node tools/build-firmware.mjs tests/valid-f446-profile.json U2 bmp180 build/f446 local-f446
node tools/build-firmware.mjs tests/valid-f446-soft-profile.json U2 bmp180 build/f446-soft local-f446-soft
node tools/build-firmware.mjs tests/selftest-f401-profile.json MCU mcu-selftest build/selftest local-mcu
node tools/build-firmware.mjs tests/led-f401-profile.json D1 led-blink build/led-fast local-led-fast
```

Bu komut satırı örnekleri için `arm-none-eabi-gcc` ve `arm-none-eabi-objcopy` PATH'te olmalıdır. Paketli Workbench kendi doğrulanmış derleyicisini kullanır. Üretilen `artifact.json` hedef MCU, pinler, çalıştırma kimliği ve `.bin` SHA-256 değerini taşır. Workbench de binarın özetini ve flash öncesi canlı UID'yi yeniden kontrol eder. Tanı firmware'i hedefteki mevcut uygulamayı siler; test bitince üretim yazılımı ayrıca yeniden yüklenir.

Özel GitHub deposu henüz kurulmadan geliştirici masasında uçtan uca test:

```sh
node tools/run-local.mjs tests/valid-profile.json U1 bmp180 http://192.168.4.1
node tools/run-local.mjs tests/valid-profile.json U1 bmp180 http://192.168.4.1 --flash
```

İlk komut yalnız derler. `--flash` eklenen ikinci komut ESP'de canlı STM32 modelini ve UID'yi tekrar kontrol eder, mevcut firmware'i silip tanı kodunu yükler, ardından yalnız bu çalıştırmaya ait geçerli SRAM raporunu kabul eder. Bunun için ESP32'nin güncel firmware'i (`runHash` alanlı rapor API'si) ve ortak GND + SWCLK + SWDIO bağlantısı gerekir. Test profili gerçek kartın sensör pinleriyle uyuşmalıdır; örnek fixture'ı rastgele karta flashlamayın.

Yeni sensör testi eklemek için `templates/bmp180.c` örneğini temel alın, yalnız `diagnostic_run(diagnostic_result_t *)` fonksiyonunu uygulayın. Pin numarası, MCU modeli veya kart adı sensör kaynak dosyasına yazılmamalı; bunlar doğrulanmış BoardProfile'dan `generated_config.h` içine derleme sırasında alınır. Yeni testin protokol/cihaz doğrulaması ve sahada bilinen bir referans kartla ölçümü yapılmadan katalogda `ready` durumuna geçirilmemelidir.
