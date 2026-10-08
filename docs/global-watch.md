# ELF ile global değişken izleme

RAMDENEME örneği: `code-repo/tests/ram-watch-f446`.
Asıl çalışma projesi: `/home/ayberk/YRT_Projects/RAMDENEME`.

1. `make -j4` ile F446 firmware’ini derle.
2. ESP32-S3 yazılımını güncelle: kök dizinde `pio run -e esp32-s3-n16r8 -t upload`.
3. Hızlı Yükleme’de aynı derlemenin `build/RAMDENEME.elf` dosyasını seç ve yükle.
4. **Değişkenleri izle** kısayolunu aç. Son başarıyla yüklenen ELF hedef UID’sine göre otomatik aktarılır; Canlı İzleme → Değişkenler’de yeniden seçilmesi gerekmez.
5. `watch_random` ara, Ekle, İzlemeyi başlat. İstenirse `watch_counter`, `watch_temperature`, `watch_signed` ekle.

UART veya sensör kablosu eklenmez; mevcut SWD hattı kullanılır. Önce flash
SHA-256 özeti kontrol edilir, ardından ELF/DWARF’tan çıkarılan RAM adresleri
salt okunur. STM32 çekirdeği durdurulmaz. Okuma aralığı 250/500/1000 ms;
grafikte son 240 örnek, CSV’de Ayarlar’daki kayıt sınırı kullanılır.

F401/F411/F446’nın bilinen SRAM sınırlarında en fazla 16 sayısal global veya
statik değişken izlenir. İşaretli/işaretsiz 8/16/32/64-bit, float, double,
bool desteklenir. JavaScript sayı sınırını aşan 64-bit tamsayılar kayıpsız
metin olarak gösterilir; bunlara sayısal grafik çizilmez.

Yerel stack değişkenleri, pointer, dizi ve struct bu sürümde yok. Optimizasyon
nedeniyle ELF’te RAM adresi kalmamış değişken listelenmez. Kendi derlemelerinde
`-g -Og` kullan; gerçekten kullanılan `volatile` global deneme için uygundur.
STARDROP’un yerel derleyicisi artık debug bilgili ELF’i BIN yanında saklar ve
başarılı yüklemeden sonra izleme ekranına aktarır. Bu oturum içi dosya ilişkisi
uygulama kapanınca unutulur; yeniden açınca aynı ELF’i seçebilirsin. Açık bir
izleme sekmesi de yeni başarılı ELF yüklemesine geçer. **ELF değiştir** ile
ek dosya seçilebilir; **Son yüklenen ELF** ile otomatik kaynağa geri dönülür.
Elle seçilen dosya sırf sekme değişti diye üzerine yazılmaz. BIN yüklemesi
otomatik ELF ilişkisini kaldırır; seçilen her ELF için flash eşleşmesi yine
izleme başlatılırken kontrol edilir.

Sekme değiştirilince okuma durur. Bekleyen istek bitene kadar ortak donanım
kilidi tutulur; paralel flash/telemetri okuması başlatılmaz. UID değişince,
bilinen firmware yükleme/reset işleminde veya eşleşme kaybolunca oturum kapanır.
Flash özeti beş saniyede bir tekrar kontrol edilir; başka programlayıcının
yaptığı değişiklik bu kontrol aralığında fark edilir, anlık garanti değildir.
Flash’ı çalışma sırasında değiştiren firmware bu mod için uygun değildir.

SWD değerleri örnekler; bütün değişkenler atomik tek kare olarak okunmaz.
Birden fazla RAM kelimesine yayılan değerler iki kez karşılaştırılır; farklı
çıkanlar geçersiz gösterilir. Bu yöntem atomik snapshot garantisi vermez.

Derleme ve taklit arayüz testleri gerçek kartta doğrulamanın yerini tutmaz.
Bu özellik breakpoint/step debugger veya güvenlik sertifikalı uçuş denetimi
değildir; masabaşı geliştirme ve inceleme içindir.
