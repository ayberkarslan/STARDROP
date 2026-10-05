# STARDROP Yapılacaklar

Bu dosya geliştirme sırasında alınan kararların ve sıradaki işlerin ortak kaydıdır.

## Çalışma kuralları

- [ ] UI/UX düzenlemelerinde mevcut işlevleri kaldırma, devre dışı bırakma veya davranışlarını değiştirme.
- [ ] Tasarım değişikliklerini küçük parçalar halinde yap ve her parçayı ayrı doğrula.
- [ ] Küçük, tek amaçlı ve kısa mesajlı yerel commitler oluştur.
- [ ] Donanım gerektiren işleri masa başında tamamlanmış sayma; atölyede gerçek kartla doğrula.
- [ ] Kullanıcıya gösterilen test sonucu ile fiziksel olarak doğrulanmış sonucu birbirinden ayır.

## Öncelik: SWD üzerinden canlı sensör verisi

Karar: IDE'ye ait Live Expressions sistemini ürünün temeli yapmayacağız. STM32 test yazılımı ölçümleri ortak bir RAM alanına yazacak; ESP32 bu alanı yalnız SWDIO ve SWCLK üzerinden okuyup masaüstü uygulamasına aktaracak.

- [ ] Mevcut 128 baytlık tek sonuç raporunu koru; geriye dönük uyumluluğu bozma.
- [ ] Canlı ölçümler için sürümlü bir `STARDROP Telemetry ABI` tanımla.
- [ ] RAM alanında magic, ABI sürümü, sıra numarası, zaman, durum, kanal sayısı ve CRC bulundur.
- [ ] Okuma sırasında değişen veriyi algılamak için başlangıç/bitiş sıra numarası kullan.
- [ ] Sabit boyutlu örnek tamponu veya çift tampon tasarla; STM32 çalışırken güvenli okunabilsin.
- [ ] ESP32'ye işlemciyi durdurmadan ve reset atmadan salt-okunur SWD telemetri endpoint'i ekle.
- [ ] Telemetri okumasında kullanılan SWD bağlantı yolunu flash/kurtarma yolundan ayır; canlı okumada NRST kullanma.
- [ ] ESP32'den uygulamaya canlı veri akışı için SSE veya uygun akış endpoint'i ekle.
- [ ] Test kataloğuna sensörden bağımsız kanal şeması ekle: kanal kimliği, görünen ad, birim, veri tipi, ölçek ve önerilen örnekleme hızı.
- [ ] Masaüstü uygulamasında kanal şemasından otomatik değer kartları ve zaman grafikleri üret.
- [ ] Bağlantı kopması, eski örnek, CRC hatası ve örnek kaybını arayüzde açıkça göster.
- [ ] Canlı izleme başlamadan önce hedef UID, MCU modeli, test kimliği ve çalışma kimliğini doğrula.
- [ ] Kayıt alma, CSV dışa aktarma ve test geçmişine özet ölçüm ekleme seçeneklerini tasarla.
- [ ] Geliştirici aracı olarak ELF sembolünden değişken izlemeyi daha sonra ayrıca değerlendir; ana kullanıcı akışına bağlama.

## İlk uçtan uca doğrulama

- [ ] Ortak telemetri yapısını önce basit bir sayaç/sahte sensör firmware'i ile doğrula.
- [ ] STM32 çalışırken ESP32'nin RAM'i kesintisiz okuyabildiğini ölç.
- [ ] Okuma hızını, STM32 üzerindeki etkisini ve SWD hata oranını kaydet.
- [ ] Sonra tek gerçek sensörle iki veya daha fazla kanalı canlı göster.
- [ ] MS5611 için basınç ve sıcaklık kanallarını ekle.
- [ ] BHI360 için seçilen teste göre ivme ve açısal hız kanallarını ekle.
- [ ] PASS/FAIL sonucu ile canlı ölçüm akışının aynı test çalışmasına ait olduğunu doğrula.

## Atölyede yapılacak kontroller

- [ ] ESP32–STM32 bağlantısını ortak GND, SWDIO ve SWCLK ile gerçek donanımda doğrula.
- [ ] STM32'nin ayrı ve kararlı beslendiğini doğrula; hedef besleme algısını değerlendir.
- [ ] Canlı SWD okumasının kullanıcı firmware'ini durdurmadığını veya resetlemediğini osiloskop/uygulama davranışıyla kontrol et.
- [ ] Kablo uzunluğu ve temas kalitesinin güvenilir hız sınırına etkisini ölç.
- [ ] SWDIO/SWCLK hatları için seri direnç, ESD koruması ve hedef kapalıyken geri besleme riskini donanım tasarımında değerlendir.
- [ ] Birden fazla STM32 için doğrudan paralel bağlantı yerine SWD hat seçici/mux prototipini ayrıca dene.
- [ ] Uçuş modu ile bakım/test modunu ayıracak donanım veya yazılım kilidini belirle.

## Arayüz ve deneyim

- [ ] Kullanıcının istediği UI/UX değişikliklerini mevcut işlevleri koruyarak uygula.
- [ ] Yeni Test akışında canlı ölçüm ekranının yerini belirle: yükleme sonrası otomatik açılan sonuç adımı.
- [ ] Testin `hazırlanıyor`, `yükleniyor`, `çalışıyor`, `veri geliyor`, `tamamlandı` durumlarını tek akışta göster.
- [ ] Sensöre özel ekran yazma; görünümü katalogdaki kanal tanımından oluştur.
- [ ] Grafik bulunmayan testlerde sade PASS/FAIL ve ölçüm özeti göster.
- [ ] Hataları tarayıcı uyarısı yerine STARDROP tasarımındaki bildirimlerle göster.

## GitHub ve test kataloğu

- [ ] Özel depo okuma/yazma yetkilerini gerçek kullanıcı hesabıyla uçtan uca doğrula.
- [ ] GitHub App'in test deposuna kurulu ve Contents: Read and write yetkili olduğunu doğrula.
- [ ] MS5611 ve BHI360 test projelerini ortak proje standardına göre kataloğa ekle.
- [ ] Her test için desteklenen MCU, protokol, zorunlu pin rolleri, sonuç türü ve telemetri kanallarını katalogda tanımla.
- [ ] Yeni sensör ekleme sürecini örnek test ve kısa geliştirici belgesiyle standartlaştır.

## Güvenlik ve sınırlar

- [ ] SWD canlı izlemeyi asli uçuş telemetrisi veya uçuş güvenliği mekanizması olarak kullanma.
- [ ] Uçuş sırasında debug erişiminin açık kalıp kalmayacağına sistem güvenliği analiziyle karar ver.
- [ ] Bozuk veya yabancı firmware'den gelen RAM verisini magic, sürüm, boyut, kimlik ve CRC doğrulanmadan gösterme.
- [ ] Telemetri okuma hatasının STM32 flash belleğini değiştirmediğini garanti eden salt-okunur kod yolunu test et.
