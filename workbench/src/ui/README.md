# STARDROP UI temeli

`index.js` ortak arayüz bileşenlerinin giriş noktasıdır. `primitives.css` renk ve kontrol stillerini tek kez uygular; ekranların yerleşimi kendi CSS dosyalarında kalır.

- `BackArrow`: yalnız ok gösterir, erişilebilir adı zorunlu kullanımda verilir; nereye döneceğini ekran belirler.
- `SelectMenu`: ortak dropdown davranışı; seçili satırın düz sol çizgisi burada stillenir.
- `ui-choice-card`: siyah zeminli seçim kartı. İçerik ve yerleşim ekrana aittir.
- `useSlidingMarker` + `SlidingMarker`: seçili öğenin düz sol çizgisi; yalnız seçim veya boyut değişince konum ölçer. Menü öğeleri `data-marker-key` taşır.
- Sol çizgi kullanan menü öğelerinde sol köşeler düz, sağ köşeler ekranın mevcut yarıçapında kalır.

Yeni ekranlarda önce bu parçaları kullan; mevcut iş akışlarını sırf görünüm için yeniden yazma. Yeni ortak desenleri gerçek ikinci kullanım ortaya çıktığında buraya taşı.
