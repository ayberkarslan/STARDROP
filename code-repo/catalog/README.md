# STARDROP test kataloğu · v2

`catalog.json` iki katmandır: `devices[]` bir fiziksel parçayı ve her
`interfaces[]` kaydında bağlantı türüne özgü zorunlu/isteğe bağlı pinleri tanımlar;
`tests[]` aynı parça için birden çok tanı varyantı
tanımlar. Örneğin BHI360 kimlik ve tam ölçüm testleri ayrı kayıtlar olabilir.
`deviceId` geçerli bir cihazı göstermeli; testin `protocol` ve `requiredRoles`
alanları cihazın izin verdiği arayüz ve rollerle uyuşmalıdır. Parça eşleştirmesi
cihazın `matchParts` adları üzerinden yapılır; netlistte görünmek testin hazır
olduğu anlamına gelmez.

`planned` kayıt yalnız keşif ve pin inceleme içindir. `ready` kaydı ancak kaynak
manifesti, desteklenen MCU, derleme türü (`stm32-hal-v1`), sonuç türü (`visual`
veya `sram`) ve gerekli pin rolleri doğrulanınca kullanılabilir. `sram` sonucu
test kodunun STARDROP tanı raporu ABI'sine göre PASS/FAIL/FATAL ve gerçek ölçüm
ayrıntısı yazmasını gerektirir; flash yazma doğrulaması sensör PASS sayılmaz.
Yalnız `visual` testte kullanıcı fiziksel sonucu onaylar.

Önerilen düzen:

```text
catalog/catalog.json
tests/<test-id>/stardrop-project.json
tests/<test-id>/Src/...
tests/<test-id>/Inc/...
shared/                  # ortak bus, zamanlama, rapor ve sürücü kodu
```

Her testin `stardrop-project.json` manifesti kaynakları, include dizinlerini ve
linker dosyasını listeler. Ortak dosyalar `@repo/` ile referans edilir. Test
kodu MCU pinlerini veya kart referansını sabitlemez: Workbench onaylı kart
profilinden `pin_configurations.h` üretir. `STARDROP_I2C_SCL_*`,
`STARDROP_I2C_SDA_*`, `STARDROP_I2C_INT_*`, `STARDROP_I2C_RESET_*` ve
SPI/GPIO karşılıkları aynı adlandırma düzenini izler. Bus için
`STARDROP_I2C_BUS_SOFTWARE` / `STARDROP_I2C_BUS_NUMBER` veya
`STARDROP_SPI_BUS_NUMBER` tanımlanır. Test yalnız manifestindeki rollere
bağlanmalı; isteğe bağlı roller bulunmadığında kod bunu açıkça ele almalıdır.

Yeni sensör ekleme sırası: cihaz tanımı → `planned` test varyantı → ortak bus
adaptörü ve sensör sürücüsü → gerçek sonuç ölçütü → desteklenen hedefte derleme
ve fiziksel doğrulama → `ready`. BHI360 şu an `planned`dır; resmi Bosch
SensorAPI/firmware'i entegre edilip F446 derlemesi doğrulanmadan çalıştırılamaz.
Pasiflerin sağlamlığı bu test sözleşmesinin kapsamında değildir.

Katalog v1 eski LED projeleri için okunmaya devam eder; yeni kayıtlar v2 cihaz
tanımı kullanmalıdır. Hedef paket pinout'u Workbench içinde sürümlüdür ve
GitHub kataloğundan gelen bilgiyle geçersiz bir fiziksel pin açılamaz.

İlk LED testi geçmişte köke yüklenen CubeMX projesini `stardrop-project.json`
ile kullanmaya devam eder. Bugünkü yerel derleyici yalnız STM32F401CC/CD
projelerini derler. Kaynaklar sabit GitHub commit SHA'sıyla önbelleğe alınır ve
derlemeden önce dosya karmaları doğrulanır.
