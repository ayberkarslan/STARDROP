# STARDUSTv4 OBC · ayrık test haritası

Kaynak: `/home/ayberk/YRT_Projects/STARDUSTv4_OBC/`; kart bağlantıları için
`OBC - Copy.NET` profili kullanıldı. Bunun STARDUSTv4 üretim revizyonuyla
aynı netlist olduğu **doğrulanmalı**. Profil F446RET6 parçasını tanır fakat
elektriksel ve fiziksel doğruluk için kullanıcı pin onayı zorunludur.

| Bileşen | OBC pinleri | Bağımsız test | Şu anki sınır |
| --- | --- | --- | --- |
| BMP581 barometre | PA8 SCL, PB4 SDA, PA9 INT | `bmp581-f446` | Basınç ve sıcaklık SWD global/telemetri; fiziksel doğrulama bekliyor |
| BHI360 IMU | PB10 SCL, PB3 SDA, PC5 INT, PC4 RESET | `bhi360-identity` | Yalnız kimlik/hat testi; ivme/jyro için firmware ve FIFO sürücüsü gerekir |
| D6 / D7 LED | PA15 / PB7 | `led-blink-f446` | Görsel doğrulama; D3–D5 güç göstergesi, GPIO testi değil |
| W25Q256 harici flash | Netlistte alternatif pin adayları | Yok | MOSI/MISO/CS/SCK eşleşmesi belirsiz; otomatik sürülmez |
| MCP2551 CAN | Netlistte transceiver | Yok | CAN karşı uç, terminasyon ve güvenli test çerçevesi gerekir |
| SD / buzzer / diğer çıkışlar | Revizyona göre doğrulanmalı | Yok | Rastgele GPIO ya da tüm uygulama kodu test olarak sunulmaz |

OBC uygulamasındaki piroteknik/ateşleme çıkışları bu test paketine **dahil
değildir**. Testler tam OBC firmware'ini yeniden kullanmaz; her biri yalnız
seçilen bileşen için derlenir. Bu hem F446RE taşınabilirliğinin hem de
istenmeyen çıkış etkinleştirmeme sınırının temelidir.

Akış: `.NET` yükle → bileşeni seç → çıkarılan pinleri şemayla karşılaştırıp
onayla → ilgili testi seç → yerel derle → bağlı UID'yi doğrula → yükle →
sonuç/Live Expressions izle. Her testin varsayılan header'ı bağımsız derleme
içindir; arayüz onaylı profile göre geçici header üretir.
