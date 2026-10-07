# RAMDENEME · Nucleo F446RE

STM32F446RET6 üzerinde SWD ile global değişken izleme denemesi.
UART ve ek sensör bağlantısı gerekmez. Değerler her 250 ms'de yenilenir.

| Değişken | Tür | Değer |
| --- | --- | --- |
| watch_random | uint32_t | 0–999 yalancı rastgele sayı |
| watch_counter | uint32_t | Güncelleme sayacı |
| watch_temperature | float | 0–99,9 test değeri; gerçek sensör ölçümü değil |
| watch_signed | int32_t | -500–499 |

`make -j4` ile `build/RAMDENEME.elf` ve `.bin` oluşur. Debug bilgili ELF'i
sakla; izleme için karta yüklenen yazılımla aynı derlemenin ELF'i gerekir.
STARDROP Hızlı Yükleme'den ELF'i yükleyip Canlı İzleme → Değişkenler'de
`watch_random` ekle. Sayılar donanım sağlık veya sensör doğrulaması değildir.

Örnekleme süresi `Inc/pin_configurations.h` dosyasında ayarlanır. Bu test
SWD pinlerini başka bir iş için yeniden yapılandırmaz.

Bu örnek bir sensör veya LED doğrulama testi değildir. Kaynak arşivinde ve
proje manifestinde yer alır; mevcut sensör kataloğuna sahte bir LED testi
olarak eklenmez. Deneme Hızlı Yükleme → ELF üzerinden yapılır.
