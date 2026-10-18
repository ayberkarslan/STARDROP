# STARDROP UI temeli

Yeni Vite uygulamaları için bağımsız giriş noktası kökteki `ui-kit/` paketidir (`@stardrop/ui`). Bu klasör uygulamaya özgü parçalar ve eski importların uyumluluk katmanıdır. `primitives.css` yalnız henüz taşınmamış yerel stilleri tutar; ekranların yerleşimi kendi CSS dosyalarında kalır.

- `BackArrow`: yalnız ok gösterir, erişilebilir adı zorunlu kullanımda verilir; nereye döneceğini ekran belirler.
- `SelectMenu`: ortak dropdown davranışı; seçili satırın düz sol çizgisi burada stillenir.
- `ChoiceCard`: siyah zeminli seçim kartı artık `@stardrop/ui` içindedir. İçerik ve yerleşim ekrana aittir.
- `useSlidingMarker` + `SlidingMarker`: seçili öğenin düz sol çizgisi; yalnız seçim veya boyut değişince konum ölçer. Menü öğeleri `data-marker-key` taşır.
- Sol çizgi kullanan menü öğelerinde sol köşeler düz, sağ köşeler ekranın mevcut yarıçapında kalır.

Yeni ekranlarda önce bu parçaları kullan; mevcut iş akışlarını sırf görünüm için yeniden yazma. Yeni ortak desenleri gerçek ikinci kullanım ortaya çıktığında buraya taşı.
