# STARDROP Diagnostics

Bu klasör, özel `stardrop-diagnostics` GitHub deposunun başlangıç içeriğidir.
Ana ESP32/Workbench deposundan bağımsız sürümlenmelidir.

## İçerik

- `runtime/`: SWD ile okunabilen, sürümlü SRAM rapor ABI'si.
- `catalog/`: Stable/dev artifact manifestinin kaynak şeması.
- `templates/`: Sensör test firmware şablonları.
- `boards/`: İncelenmiş kart profilleri.
- `.github/workflows/`: host testleri, katalog doğrulama, özel profil ve audit işleri.

## GitHub kurulumu

1. Bu klasörü özel `stardrop-diagnostics` deposuna taşıyın.
2. STARDROP GitHub App'i yalnız bu depoya kurun: `Contents: read`, `Actions: read/write`.
3. `audit-event.yml` için yöneticiye özel `stardrop-audit` deposunu oluşturun; diagnostic deposuna `AUDIT_REPOSITORY` variable'ı ve bu repoya yalnız issue yazabilen `AUDIT_TOKEN` secret'ı ekleyin.
4. Kullanıcılar kaynaklara yazma yetkisi almaz. Device Login ile kendi adlarına workflow dispatch ederler; GitHub actor bilgisi audit olayına işlenir.

`workflow_dispatch` girdi olarak yalnız normalize edilmiş `BoardProfile` JSON alır. Ham `.NET`, PDF veya API anahtarı CI'a gönderilmez.
