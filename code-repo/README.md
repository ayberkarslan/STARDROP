# STARDROP test kaynakları

GitHub deposunda bütün platform kaynakları tek `stardrop/` klasöründedir.
Bu yerel klasör o dizinin kaynak içeriğidir; yayınlama aracı doğru yere ekler.
Manifest ve katalogdaki kaynak yolları `stardrop/` dizinine göre yazılır.
Eski kök BlackPill projesi silinmeden `legacy/blackpill/` altında korunur.

```text
stardrop/
  catalog/catalog.json
  tests/led-blink-f401/   # BlackPill F401CC/CD
  tests/led-blink-f446/   # F446RE, Nucleo veya özel PCB
  library/               # Ekibin paylaştığı test düzenleri
  docs/                  # Kullanım ve pin sözleşmesi
  legacy/blackpill/      # Eski proje, değiştirilmeden
```

Her klasörde kaynaklar, hedefe ait startup/linker dosyası, derleme manifesti
ve yalnız bu kaynakların kullandığı HAL/CMSIS dosyaları var. `build/`, IDE
ayarları, CubeMX `.ioc`, hazır BIN/ELF ve tüm sürücü paketleri eklenmedi.
Sürücülerin lisanslarını ve kaynak başlıklarını koru.

## LED testini çalıştırma

1. Kaynakları GitHub'a yükle; uygulamada Ayarlar'dan test kataloğunu yenile
   ve yeni kaynak sürümünü indir/etkinleştir.
   Test Kütüphanesi'nde hazır kodu seçip Yeni Test'te açabilirsin.
2. Yeni Test → manuel kart → `STM32F446RET6` → `LED / GPIO`.
3. GPIO'yu seç. Nucleo'nun dahili LD2 LED'i **PA5, aktif yüksek**;
   başka GPIO için dirençli harici LED bağlantısı gerekir.
4. LED yönünü, yanma süresini ve sönük kalma süresini ayrı ayrı ayarla (0,05–60 saniye).
5. `LED Blink · F446RE` testini seç, pinleri onayla ve bağlı hedefi eşleştir.
6. Derle ve STM32'ye yükle. Kod yerelde derlenir; GitHub Actions gerekmez.

Örneğin 1 saniye açık + 2 saniye kapalı, 3 saniyelik tam çevrim verir.
LED sonucunu kullanıcı gözle onaylar;
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
#define STARDROP_LED_ON_MS 1000
#define STARDROP_LED_OFF_MS 2000
#define STARDROP_LED_SERIAL_ENABLED 0
```

Uygulama bu başlığı geçici derleme dizininde üretir ve include sırasının
başına koyar. GitHub kaynaklarına veya orijinal projeye pin/süre yazmaz.
Katalog testin MCU ailesini, manifest ise gerçek HAL hedefini belirtir;
F401 kaynakları F446 isteğiyle derlenemez. PA13/PA14 SWD için ayrılmıştır.

Yeni testte aynı klasör/manifest/pin-rol düzenini kullan. Sensör kodu ve
başarı ölçütü hazır olmadan `ready` yapma. BHI360 için yalnızca bağlantı/kimlik
testi hazırdır; ivme/jyro ölçümü henüz hazır değildir.

## Ekiple proje paylaşma

Yükleme adımındaki “Projeyi ekiple paylaş” çalışma seçimini kütüphaneye taşır.
Kayıt adı ve isteğe bağlı not dışında bilgi dosyası elle yazılmaz. Tek GitHub
commit'inde `library/<id>.json`, `library/projects/<id>/project.stardrop` ve
otomatik `README.md` eklenir. Proje pin/süre ayarlarını, kart dosyalarını ve
test geçmişini içerir; kaynak kodu katalogdaki test ve commit ile eşleşir.
API anahtarları ve fiziksel hedef UID'si paylaşılmaz. Yeniden açılan proje
canlı hedefle eşleştirilmeden ve pinler onaylanmadan yüklenemez.
