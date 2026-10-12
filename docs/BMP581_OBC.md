# OBC BMP581 testine geçiş

Kaynak: `code-repo/tests/bmp581-f446/README.md`.
Hazır geliştirme çıktıları: aynı dizinde `build/bmp581-f446.elf` / `.bin`.
Bu dosyalar Git'e eklenmez; `node build.mjs` ile yeniden üretilir.

1. OBC - Copy.NET yükle. IC6/BMP581: SCL PA8, SDA PB4, INT PA9.
2. Bileşen ekranında şema PDF'yi ekle. Metin karşılaştırması BMP581/IC6'yı
   sayfa 2'de ve MCU'yu sayfa 3'te eşleştirir. GPIO yolları NET'ten alınır.
3. Kaynaklar GitHub'a aktarılmadan katalog testi görünmez. `code-repo`
   içeriğini önceki `stardrop/` düzenini koruyarak test deposuna aktar:
   `stardrop/catalog/catalog.json`, `stardrop/tests/bmp581-f446/` ve kullanılan
   `stardrop/tests/bmp180-f446/`, `stardrop/tests/led-blink-f446/` ortak dosyaları.
   Uygulamadaki kaynak güncellemesini etkinleştir. Burada GitHub push yapılmadı.
4. BMP581 basınç testini seç. PA8/PB4 için yazılımsal I²C bus'ı kullan;
   hat adındaki I2C3'ü donanımsal bus seçimi sanma. Pinleri onayla, yükle.
5. Alternatif: hazır ELF'yi Hızlı Yükleme'den seçip yükle. Canlı İzleme →
   Değişkenler'de `pressure_pa`, `sensor_status`, `sensor_error`, `sample_counter`
   ekle. `sensor_status=1` ve artan sayaç olmadan eski basıncı geçerli sayma.

PDF incelemesi yereldir, AI anahtarı gerektirmez. Bileşen/metin eşleşmesi
elektriksel doğrulama değildir; farklı bir şemadaki aynı parça isimleri de
eşleşebilir. Şemadaki tüm çizgiler geometrik olarak çözümlenmiyor. Taranmış
(metinsiz) PDF için otomatik metin eşleştirmesi yok; kullanıcıya bildirilir.
NET bilgisi de SB14/SB15'in gerçekten lehimlendiğini kanıtlamaz.

Sensör kodu, arayüz, mock-bus ve derleyici akışları doğrulandı; fiziksel
başarı iddiası yok. Önceki SWD readback hatası giderilmeden yükleme güvenilir
sayılmaz; bu çalışma ESP firmware'ine ve flash sürücüsüne müdahale etmedi.
