# Live Expressions hız ve bağlantı

## Referanslar

13 Ekim 2026 incelemesi:

- [Cortex-Debug ayarları](https://github.com/Marus/cortex-debug/blob/master/package.json): GUI yenilemesi varsayılan 300 ms; örnekleme ayrı bir ayar ve üst sınırı 20 örnek/sn. Şema alanı ile nesne varsayılanı farklı olduğundan çalışma kodu da kontrol edildi.
- [Live Watch çalışma kodu](https://github.com/Marus/cortex-debug/blob/master/src/frontend/views/live-watch.ts): eksik `samplesPerSecond` için 4 örnek/sn kullanıyor. Tek zamanlayıcı, yenileme ve veri toplama ayrımı; işlem süresini zamanlamadan düşürme yaklaşımı var. Bu, her VS Code eklentisinin hızı demek değil.
- [STM32CubeIDE kılavuzu](https://www.st.com/resource/en/user_manual/um2609-stm32cubeide-user-manual-stmicroelectronics.pdf): Live Expressions düzenli örneklenen değerleri gösterir. Kesin varsayılan periyot doğrulanmadı. CubeIDE kaynak kodu incelenmiş gibi bir iddia yok.

## STARDROP uygulaması

- Live Expressions varsayılan hedefi 250 ms; isteğe bağlı hızlı seçenek 225 ms. Telemetri tercihi ayrı tutulur; eski tercihler/yedekler yeni alan yoksa güvenli varsayılanı alır.
- ESP firmware RAM okumasında 200 ms koruma uygular. Bir istek tamamlandıktan sonra en az 225 ms beklenir; ağdaki değişkenlik için pay bırakılır. Yavaş isteklerde geçmiş örnekleri yakalamak için sorgu yağmuru oluşturulmaz. Hatalı istek sonrası bekleme en az 500 ms.
- Hedef dönemden istek süresi düşülür, fakat güvenlik payı korunur. Bu yüzden gerçek periyot hedefi aşabilir. 16 değişken, Wi-Fi gecikmesi ve 5 saniyede bir tam flash doğrulaması hızı etkiler. USB ST-LINK ile Wi-Fi/ESP yolunun aynı hızda olduğu varsayılmaz.
- Rust LAN HTTP istemcisi yeniden kullanılır, zaman aşımı her istekte ayrı uygulanır. İstemci LAN için proxy kullanmaz ve yönlendirme izlemez. Sunucu bağlantıyı kapatıyorsa bağlantı havuzu onu zorla açık tutmaz.
- Son başarılı RAM yanıtının yaşı ve HTTP/SWD gidiş-dönüş süresi gösterilir. Küçük gösterge 100 ms'de bir güncellenir; yeni ağ isteği oluşturmaz, tüm grafikleri yeniden çizmez.
- “Yanıt gecikti” kesin fiziksel kopma anlamına gelmez. Başarılı cevabın yaşı beklenen aralığı aştığında gösterilir; hata/yeniden deneme ayrı durumdur. İzleme durdurulunca eski veri canlı gibi sunulmaz. Son başarılı değerler saklanır.
- Kapalı grafiklerin SVG hesabı yapılmaz. Grafik açılınca mevcut sınırlı geçmişten çizilir. CSV, grafik, değişken ekleme/çıkarma ve ELF/UID doğrulamaları korunur.

## Sınırlar

Bu gerçek zaman garantili bir uçuş kayıt sistemi değildir. Ağdan milisaniyelik kesin kopma bilgisi veya arada gerçekleşen her değişken değişimini yakalama garantisi verilmez. Daha yüksek hız için ESP tarafında örnekleme + tampon + veri akışı ayrıca tasarlanmalı ve gerçek kartla ölçülmelidir; doğrulama kontrollerini kaldırmak hız çözümü değildir.

Doğrulama: zamanlama/freshness testleri, tarayıcıda canlı gösterge ve açılır grafik, Rust istemci yeniden kullanım testi. Gerçek kart üzerinde yeni hızın gecikme ve SWD yük ölçümü bu değişiklikte yapılmadı. ESP firmware değişmedi.

## Kompakt ekran ve devam etme

Ana ekran yalnız Live Expressions gösterir. Kart/ELF aynı satırda; isimle ekleme ve aranabilir ELF listesi hemen altında. Okuma ayarı sağdaki ortak Popup panelindedir. Eski telemetri ABI kayıt/grafik/CSV araçları sekme olmaktan çıkarılıp bu panelde isteğe bağlı tutulur. Böylece sensör/değişken geçişinde GlobalWatch sökülmez.

ELF dosyası ve seçili değişkenler IndexedDB'de UID ile saklanır. Sekme taslakları bellek içinde belge + UID ile ayrılır. Uygulama tekrar açıldığında kayıtlı ELF yeniden çözümlenir; otomatik okuma veya yükleme başlamaz. Kullanıcı izlemeyi başlatır ve gerçek flash eşleşmesi tekrar doğrulanır. Başka kartın dosyası kullanılmaz.

Yerel `stardrop.firmware-history.v1` kaydı kart başına son 50 yükleme başlangıcı/başarı/hata olayını tutar: zaman, UID anahtarı, dosya adı, boyut, durum ve varsa flash SHA-256. Dosya seçmek yükleme başarısı sayılmaz. BIN yükleme veya yarım kalmış yazım eski saklanan ELF ilişkisinin otomatik kullanılmasını engeller. Harici programlayıcı değişikliklerini bu kayıt bilemez; bunun için flash doğrulaması korunur.

Tarayıcı kontrolü sekmeden ayrılma/dönme, durdurma/yeniden başlatma, uygulama yenilemesi sonrası ELF/listenin geri gelmesi, yeniden flash atmadan izleme ve başka yüklemede ilişki geçersizleşmesini kapsar. Az değişkende kaydırma gerekmediği kontrol edilir; fazla kart ve açık grafikler gerektiğinde kaydırılabilir.
