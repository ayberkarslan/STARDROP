# STARDROP test kataloğu

`catalog.json` uygulamada görünen test listesinin kaynağıdır. Her `ready` testin
`sourcePath` alanı bu depodaki bir `stardrop-project.json` dosyasını göstermelidir.
Bu dosya derleme kaynaklarını, include dizinlerini ve linker dosyasını listeler.
GPIO pinleri kaynakta sabitlenmez: STARDROP kart profilinden
`pin_configurations.h` üretir, ardından kaynakları kullanıcının bilgisayarında
derleyip ESP32 üzerinden STM32'ye yükler.

Yeni test eklerken ayrı bir `tests/<test-id>/` dizini kullanın ve kataloğa kayıt
ekleyin. İlk LED testi geçmişte köke yüklenmiş CubeMX projesini doğrudan
`stardrop-project.json` ile kullanır; sırf dizin düzeni için çalışan kodu
taşımaya gerek yoktur. Yeni bir alt klasör manifestinde ortak HAL/CMSIS dosyaları
`@repo/Drivers/...` yolu ile paylaşılabilir; diğer yollar test klasörüne göredir.
Yeni testler derleme ve hedef doğrulaması eklenene
kadar `planned` kalmalıdır; katalog kaydı tek başına firmware desteği değildir.

Workbench akışı `matchParts` + `protocol` + `supportedMcu` ile **bir bileşene
birden fazla test** gösterebilir. Örneğin MPU6050 için `mpu6050-accel` ve
`mpu6050-full` ayrı kayıtlar olabilir. `ready` yapılmadan önce her kayıt için:

1. Benzersiz `id`, okunabilir `name`, kısa `description`, `protocol` (`GPIO`,
   `I2C` veya `SPI`), `matchParts`, `supportedMcu`, `requiredRoles`, `build`,
   `result` ve `sourcePath` tanımlanır.
2. `sourcePath`, testin `stardrop-project.json` manifestine gider. Manifest,
   test kaynaklarını, `Inc/`, HAL/CMSIS include dizinlerini ve linker dosyasını
   listeler. Bir sensör testi ayrı `tests/<id>/` dizininde tutulabilir; ortak
   kaynaklar `@repo/` önekiyle paylaşılır.
3. Test kaynak kodu pin numarası veya kart referansı sabitlemez. Workbench
   onaylanan roller için geçici `pin_configurations.h` üretir: örneğin
   `STARDROP_I2C_SCL_GPIO_PORT`, `_PIN`, `_CLK_ENABLE()` ve SDA eşleri;
   SPI için SCK/MISO/MOSI/CS eşleri. Seçilen bus için
   `STARDROP_I2C_BUS_SOFTWARE`, `STARDROP_I2C_BUS_NUMBER` veya
   `STARDROP_SPI_BUS_NUMBER` tanımlanır. Sensör sürücüsü bu makroları kullanır.
4. `result` şu anda `visual` veya `sram` olabilir. `sram` testleri doğru çalışma
   kimliğiyle tanı raporu üretmelidir; `visual` testlerin sonucu kullanıcı
   tarafından onaylanır. Her iki türde de SWD yazma doğrulaması sensörün
   çalıştığını tek başına kanıtlamaz.

Bugünkü yerel HAL proje derleyicisi yalnız **STM32F401CC/CD** projelerini
derler. Katalogda başka MCU testleri listelenebilir, ancak o hedefin ayrı
startup/linker/HAL desteği eklenmeden Workbench bunları yüklemeye izin vermez.

Yalnız güvenilir repo bakımcılarına yazma izni verin. İndirilen kaynak sabit
commit SHA'sına göre önbelleğe alınır; her dosya derlemeden önce doğrulanır.
