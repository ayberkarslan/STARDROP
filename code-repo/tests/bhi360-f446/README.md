# BHI360 · STM32F446RE kimlik testi

Bu test, `STARDUSTv4_OBC` içindeki BHI360 sürücüsünden **ayrı** bir programdır.
I²C adresi 0x28 üzerindeki ürün kimliği yazmacı 0x1C okunur; 0x89 beklenir.
İlk sonuç SWD tanı raporuna yazılır. `sensor_chip_id`, `sensor_status`,
`sensor_error` ve `i2c_status` ELF üzerinden Live Expressions'ta izlenebilir.
`sensor_status`: 0 bekliyor, 1 eşleşti, 2 hata. `sensor_error`: -1 bus
başlatılamadı, -2 okuma/ACK yok, -3 yanlış kimlik, -4 MCU saat hatası.

OBC netlistindeki IC4 bağlantıları: SCL PB10, SDA PB3, INT PC5, RESET PC4.
Bu test sadece SCL/SDA kullanır ve pinleri sürükleyici profilinden üretilen
`pin_configurations.h` ile alır. PB10/PB3 çifti için yazılımsal I²C gerekir.
Başka F446RE kartta pinler değişebilir; netlistten gelen atamaları fiziksel
şemayla karşılaştırıp arayüzde onaylamadan yükleme yapma.

`node build.mjs` ile bağımsız derleme yapılır. Test **firmware yüklemez,
sensörü başlatmaz ve ivme/jyro/sıcaklık ölçmez**. Kimliğin okunması sensörün
ölçüm yapabildiğini kanıtlamaz. Fiziksel kartta henüz doğrulanmadı.
