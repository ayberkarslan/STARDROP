# S3 açılış döngüsü

## 8 Ekim 2026 kontrolü

ROM logunda sürekli `RTC_SW_SYS_RST` ve `Saved PC:0x403cdb0a`
görülüyordu. Kullanılan Arduino SDK bootloader ELF'inde bu adres
`bootloader_reset` olarak çözüldü; tek başına uygulama hatası göstermiyor.

Cihazdan okunan bölüm tablosu `default_16MB.csv` ile aynıydı.
`0x10000` adresindeki uygulama görüntüsü `esptool image_info` kontrolünü
geçemedi: bölüm başlığı yerine `0xffffffff` bulundu. Firmware görüntüsü
eksik/bozuktu. Bunun hangi işlem sırasında oluştuğu doğrulanmadı.

NVS yedeklendikten sonra normal PlatformIO yüklemesiyle bootloader,
bölüm tablosu, OTA seçici ve uygulama birlikte yeniden yazıldı. Tam Flash
silme yapılmadı; `0x9000..0xdfff` NVS alanı korundu. STM32'ye yazma veya
silme işlemi gönderilmedi.

S3 ayarında dahili USB Serial/JTAG üzerinden uygulama logları açıldı ve
N16R8'in PSRAM başlatma bayrağı eklendi. Açılış logu artık derleme zamanı,
reset sebebi ve bellek boyutlarını gösteriyor.

## Tekrar yükleme

Önce `pio device list` ile ESP'nin portunu bul. `303A:1001` dahili ESP
USB portudur; `0483:374B` Nucleo ST-LINK portudur. Port numarası değişebilir.

```sh
pio run -e esp32-s3-n16r8 -t upload --upload-port /dev/ttyACM2
pio device monitor -e esp32-s3-n16r8 --port /dev/ttyACM2
```

`/dev/ttyACM2` bu kontrol sırasında kullanılan porttur, sabit varsayılmamalı.
Yükleyici her yazdığı görüntünün hash'ini doğrulamalı. Ardından `/ping`
üzerinden uptime'ın artması ve `/api/programmer/status` yanıtı kontrol edilir.

Wi-Fi kayıtları için tam Flash silme gerekli değildir. Firmware hasarında
önce normal tam yükleme denenir; yalnız uygulama dosyasını rastgele bir
adrese yazmak veya bütün Flash'ı silmek ilk adım değildir.
