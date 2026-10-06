# Canlı İzleme

Sol menü → **Canlı İzleme** → **İzlemeyi Başlat**. Telemetri destekli testi
Yeni Test'ten yükleyince **Canlı İzlemeyi Aç** düğmesi, hedef UID ve o
çalıştırmanın beklenen test/profil/run kimlikleriyle ayrı sekme açar.

## İlk kullanım

1. ESP32-S3 firmware'ini güncelle. Kaynak: `src/main.cpp`; endpoint:
   `/api/telemetry`. Derlemek: kök dizinde `pio run -e esp32-s3-n16r8`.
   Karta yüklemek: doğru portu seçerek `pio run -e esp32-s3-n16r8 -t upload`.
   Bu geliştirme sırasında karta otomatik yükleme yapılmadı.
2. GitHub kataloğundaki BMP180/F446RE kaynağını güncelle. `code-repo`
   içeriği, mevcut repo içindeki `stardrop/` düzenini korumalı; ortak HAL
   dosyalarını da dahil et. Bu değişiklikler yalnız local commit edildi.
3. Yeni Test'te BMP180, hedef MCU ve onaylı SCL/SDA pinlerini seç;
   derle/yükle. Sensör STM32'ye bağlıdır, ESP32'ye ek sensör kablosu gerekmez.
4. Canlı İzlemeyi Aç → İzlemeyi Başlat. Sıcaklık ve basınç kanalları otomatik
   görünür. KAYDET örnekleri toplar; CSV uygulamanın veri dizinindeki
   `exports/telemetry-*.csv` dosyasına yazar ve tam yolu bildirir.

## Sınırlar

- En fazla 8 float32 kanal, yazdırılabilir ASCII ad/birim. Yeni sensör için
  ayrı arayüz parser'ı gerekmez; firmware ortak ABI v1 ile yayın yapmalıdır.
  Ayrıntılar: `code-repo/tests/bmp180-f446/README.md`.
- 250/500/1000 ms bekleme **bir yanıt bittikten sonra** başlar. 100 ms
  üretici örnekleri her zaman yakalanmaz; “Atlanan örnek” ağ paket kaybı
  değildir. Ekran son 240 okunan örneği, CSV kaydı en fazla 2000 örneği tutar.
- CRC/seqlock bozuk görüntüleri reddeder. UID, MCU veya run değişirse izleme
  durur. İki saniyeden uzun yeni örnek yoksa değerler canlı olarak sunulmaz.
- Sekme arka plana geçince/ESP kopunca okuma durur. Tek donanım kilidi
  flash/kurtarma ile çakışmayı engeller. DURDUR sonrası sürmekte olan HTTP
  isteği bitene kadar kilit bırakılmaz; eski yanıtlar ekrana işlenmez.
- Bu bir ölçüm ekranıdır; breakpoint, adım adım kod çalıştırma veya ELF
  değişken debugger'ı değildir. RAM okuma yolu NRST/halt/reset kullanmaz.
- Donanımda gerçek sensör, SWD hız/etki ve kesinti testleri henüz yapılmadı.
  Roket uçuş güvenliği veya asli uçuş telemetrisi yerine kullanılmamalıdır.

## Kontroller

Workbench dizininde `npm run test:telemetry`, `npm run test:bmp180`,
`npm run test:core`, `npm run test:ui`, `npm run build`.
Native: `src-tauri` dizininde `cargo test --lib --offline`.
Mock ekran testi: `node tools/live-monitor-smoke.mjs` (Playwright kurulumuna
göre `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `UI_URL` ayarlanabilir).
Mock test gerçek karta erişmez.
