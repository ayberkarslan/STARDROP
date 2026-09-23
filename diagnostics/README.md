# STARDROP Diagnostics

Bu klasör, özel `stardrop-diagnostics` GitHub deposunun başlangıç içeriğidir.
Ana ESP32/Workbench deposundan bağımsız sürümlenmelidir.

## İçerik

- `runtime/`: SWD ile okunabilen, sürümlü SRAM rapor ABI'si.
- `catalog/`: Stable/dev artifact manifestinin kaynak şeması.
- `templates/`: Her sensör için `diagnostic_run()` uygulayan küçük C dosyaları.
- `firmware/`: Ortak Cortex-M4 başlangıç kodu, yazılımsal I²C ve SRAM raporu.
- `boards/`: İncelenmiş kart profilleri.
- `.github/workflows/`: host testleri, katalog doğrulama, özel profil ve audit işleri.

## GitHub kurulumu

1. Bu klasörü özel `stardrop-diagnostics` deposuna taşıyın.
2. STARDROP GitHub App'i yalnız bu depoya kurun; Device Flow'u etkinleştirin. Prototip için uygulama izinleri `Contents: read/write`, `Actions: read/write` olmalıdır. Katalog düzenleme ekranı yalnız depo yöneticisine gösterilir; üretimde kaynak kod izinlerini ayrı bir servis veya korumalı depo ile ayırın.
3. `audit-event.yml` için yöneticiye özel `stardrop-audit` deposunu oluşturun; diagnostic deposuna `AUDIT_REPOSITORY` variable'ı ve bu repoya yalnız issue yazabilen `AUDIT_TOKEN` secret'ı ekleyin.
4. Operatörlerin workflow dispatch yetkisi olmalıdır. Bu prototipte GitHub yetki modeli ayrı bir yönetim servisi olmadan “salt okunur kaynak + dispatch” ayrımını kesin olarak sağlayamaz; üretim erişim politikası ayrıca tasarlanmalıdır.

`workflow_dispatch` girdi olarak yalnız normalize edilmiş `BoardProfile` JSON alır. Ham `.NET`, PDF veya API anahtarı CI'a gönderilmez.

## Çalışan prototip kapsamı

F401CC ve F446RE için BMP180 kimlik + ham sıcaklık ADC örneği ve genel I²C ACK taraması derlenir. Genel I²C taramasının PASS sonucu belirli sensörün sağlam olduğunu **kanıtlamaz**; yalnız o bus üzerinde en az bir adresin yanıt verdiğini gösterir. BMP180 ham ADC sayısı gerçek sıcaklık değildir. MS5611, BMP388, ICM20689 ve SPI testleri henüz `planned` durumundadır.

Yerel derleme kontrolü:

```sh
node tools/build-firmware.mjs tests/valid-profile.json U1 bmp180 build/f401 local-f401
node tools/build-firmware.mjs tests/valid-f446-profile.json U2 bmp180 build/f446 local-f446
```

`arm-none-eabi-gcc` ve `arm-none-eabi-objcopy` gerekir. CI bunları kurar. Üretilen `artifact.json` hedef MCU, pinler, çalıştırma kimliği ve `.bin` SHA-256 değerini taşır. Workbench bu veriler uyuşmadan flashlamaz. Tanı firmware'i hedefteki mevcut uygulamayı siler; test bitince üretim yazılımı ayrıca yeniden yüklenir.

Yeni sensör testi eklemek için `templates/bmp180.c` örneğini temel alın, yalnız `diagnostic_run(diagnostic_result_t *)` fonksiyonunu uygulayın. Pin numarası, MCU modeli veya kart adı sensör kaynak dosyasına yazılmamalı; bunlar doğrulanmış BoardProfile'dan `generated_config.h` içine derleme sırasında alınır. Yeni testin protokol/cihaz doğrulaması ve sahada bilinen bir referans kartla ölçümü yapılmadan katalogda `ready` durumuna geçirilmemelidir.
