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

Yalnız güvenilir repo bakımcılarına yazma izni verin. İndirilen kaynak sabit
commit SHA'sına göre önbelleğe alınır; her dosya derlemeden önce doğrulanır.
