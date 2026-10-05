# STARDROP test kaynakları

Bu klasörün **içeriğini** `ayberkarslan/stardrop-code-repo` deposunun köküne
yerleştir. Kökten `catalog/catalog.json` okunabilmeli; `code-repo/` diye bir
üst klasör oluşturma. Mevcut kök BlackPill projesini silmen gerekmez; yeni
katalog artık `tests/` altındaki temiz projeleri kullanır.

```text
catalog/catalog.json
tests/led-blink-f401/   # BlackPill F401CC/CD
tests/led-blink-f446/   # F446RE, Nucleo veya özel PCB
```

Her klasörde kaynaklar, hedefe ait startup/linker dosyası, derleme manifesti
ve yalnız bu kaynakların kullandığı HAL/CMSIS dosyaları var. `build/`, IDE
ayarları, CubeMX `.ioc`, hazır BIN/ELF ve tüm sürücü paketleri eklenmedi.
Sürücülerin lisanslarını ve kaynak başlıklarını koru.

## LED testini çalıştırma

1. Kaynakları GitHub'a yükle; uygulamada Ayarlar'dan test kataloğunu yenile
   ve yeni kaynak sürümünü indir/etkinleştir.
2. Yeni Test → manuel kart → `STM32F446RET6` → `LED / GPIO`.
3. GPIO'yu seç. Nucleo'nun dahili LD2 LED'i **PA5, aktif yüksek**;
   başka GPIO için dirençli harici LED bağlantısı gerekir.
4. LED yönünü ve geçiş aralığını (50–5000 ms) ayarla.
5. `LED Blink · F446RE` testini seç, pinleri onayla ve bağlı hedefi eşleştir.
6. Derle ve STM32'ye yükle. Kod yerelde derlenir; GitHub Actions gerekmez.

Süre her durumun bekleme süresidir: 100 ms seçimi 100 ms açık + 100 ms
kapalı, yani 200 ms tam çevrim verir. LED sonucunu kullanıcı gözle onaylar;
başarılı flash işlemi otomatik olarak LED testi başarılı sayılmaz.

## Pin sözleşmesi

Firmware pinleri `Inc/pin_configurations.h` üzerinden kullanır:

```c
#define STARDROP_PIN_SCHEMA_VERSION 1
#define STARDROP_LED_GPIO_PORT GPIOA
#define STARDROP_LED_GPIO_PIN GPIO_PIN_5
#define STARDROP_LED_GPIO_CLK_ENABLE() __HAL_RCC_GPIOA_CLK_ENABLE()
#define STARDROP_LED_ACTIVE_LOW 0
#define STARDROP_LED_BLINK_MS 100
#define STARDROP_LED_SERIAL_ENABLED 0
```

Uygulama bu başlığı geçici derleme dizininde üretir ve include sırasının
başına koyar. GitHub kaynaklarına veya orijinal projeye pin/süre yazmaz.
Katalog testin MCU ailesini, manifest ise gerçek HAL hedefini belirtir;
F401 kaynakları F446 isteğiyle derlenemez. PA13/PA14 SWD için ayrılmıştır.

Yeni testte aynı klasör/manifest/pin-rol düzenini kullan. Sensör kodu ve
başarı ölçütü hazır olmadan `ready` yapma; BHI360 hâlâ `planned`.
