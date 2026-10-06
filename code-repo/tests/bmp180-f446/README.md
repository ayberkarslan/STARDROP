# BMP180 · STM32F446RE

Kaynak proje: `YRT_Projects/BME180PROJ`. Gerçek sürücü BMP180 içindir;
BME280/BMP280 ile uyumlu değildir. Kart üzerinde henüz doğrulanmadı.

Workbench onaylı SCL/SDA bağlantılarından `pin_configurations.h` üretir ve
manifestteki C/C++ kaynaklarını yerelde derler. Varsayılan: I2C1 PB6/PB7,
100 kHz, adres 0x77, 100 ms örnek aralığı, OSS=0. I2C1/2/3 için yalnız MCU'nun
AF4 pinleri seçilebilir; yazılımsal I2C için uygun GPIO çifti kullanılabilir.
Harici pull-up'lar ve doğru besleme gerekir. Nucleo üzerindeki SWD pinleri
sensör pinleri değildir: ESP sadece STM32 programlama/rapor okuma yapar.

`Inc/sensor_config.h`: örnek aralığı, zaman aşımı, oversampling varsayılanları.
Pinler sürücüye yazılmaz. Sürücüde sonsuz I2C bekleme yoktur; kalibrasyon ve
hesaplama hataları geçerli ölçüm olarak yayınlanmaz.

## RAM sözleşmesi

- `0x20000100`: mevcut ESP `/api/diagnostic/report` için 128 bayt ilk ölçüm raporu.
  PASS yalnız kimlik/kalibrasyon ve ilk makul ölçümün alınmasıdır; sensörün
  doğruluğunu veya roket sisteminin uçuşa uygunluğunu kanıtlamaz.
- `0x20000200`: 400 bayt `stardrop_telemetry_t`, ABI v1. İlk sekiz uint32:
  magic (0x53544c4d), version (1), size (400), sequence, timestamp_ms,
  sample_counter, status, channel_count. Sonraki üç uint32 test_id_hash,
  profile_hash, run_hash. Sonra en fazla sekiz kanal:
  name[24], unit[12], float32 value, uint32 valid (kanal başına 44 bayt).
- Tüm sayılar little endian; status 0=başlatılıyor, 1=ölçüm başarılı, 2=hata.
  Kanal adları `temperature` / `pressure`, birimleri `degC` / `Pa`.
- Host önce sequence okur, çift ise frame'i ve sonra sequence'i tekrar okur.
  İki sequence ve frame içindeki sequence aynı ve çift değilse örneği atar.
  En sondaki uint32 CRC32, önceki 396 baytın IEEE CRC32'sidir (0xedb88320,
  başlangıç 0xffffffff, sonda tümleme). CRC uyuşmazsa frame reddedilir.
  Magic/version/size/channel_count doğrulanmadan veri kullanılmaz.
- Başarısız okumada son değerler kalır ama valid=0 olur. timestamp ve sayaç
  yalnız başarılı okumada ilerler. Host ayrıca zaman aşımını izlemelidir;
  duran MCU'nun eski valid=1 ölçümü canlı değildir.
- Linker ilk 1 KB RAM'i ayırır; telemetry/rapor .data/.bss/heap ile çakışmaz.
  RAM içeriği resetten sonra init ile temizlenir. Flash veya USART'a veri yazılmaz.

Canlı ESP veri akışı ve grafik ekranı henüz eklenmedi. Format bunlara hazırdır;
mevcut ekran yalnız ilk ölçüm raporunu okuyabilir. Sonraki sensörler aynı kanal
yapısıyla isim/birim/değer yayınlayabilir; sensöre özel parser gerekmez.

Bu klasörü tek başına yükleme: manifest ortak HAL kaynaklarını
`@repo/tests/led-blink-f446/Drivers` yolundan kullanır. GitHub'a `code-repo`
içeriğinin tamamını mevcut `stardrop/` klasör yapısında taşı.

Referans: [Bosch BMP180 datasheet](https://cdn-shop.adafruit.com/datasheets/BST-BMP180-DS000-09.pdf),
[STM32F446 datasheet](https://www.st.com/resource/en/datasheet/DM00141306.pdf).
