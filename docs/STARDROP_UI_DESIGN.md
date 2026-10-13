# STARDROP arayüz dili

Yıldız Roket Takımı · 13 Ekim 2026

**Hedef:** siyah-beyaz, sade, teknik ve masaüstü hissi veren bir mühendislik
çalışma alanı. Premium görünüm; efekt kalabalığından değil, boşluk, hizalama,
okunabilirlik ve tutarlı davranıştan gelir. Sadeleştirme işlev kaldırmak değildir.

Bu rapor mevcut kodu esas alır. Performans ve kritik test kuralları ayrıca
belirtilen geliştirme hedefleridir; STARDROP'un uçuş/ateşleme için sertifikalı
veya ölçülmüş bir gerçek zamanlı sistem olduğu anlamına gelmez.

## 1. Gerçekte kullandığımız araçlar

| Araç | Rolü |
| --- | --- |
| React 18 + React DOM | Bileşenler, ekranlar, yerel durum ve etkileşimler |
| Tauri 2 + Rust | Masaüstü pencere, yerel dosya/cihaz işlemleri; React ile komut ve olay iletişimi |
| Vite 6 + React eklentisi | Geliştirme sunucusu, derleme ve dinamik modül yükleme |
| `lucide-react` | Aynı çizgi dilinde SVG ikonlar |
| Michroma Regular | Uygulamanın karakteristik yazı tipi; dosya uygulamada, Google'a çalışma anında istek yok |
| Standart CSS, Grid, Flexbox | Tema, yerleşim, uyarlanabilir paneller ve durum stilleri |
| Yerel SVG | Küçük canlı grafikler, pin bağlantıları ve sabit yıldız arka planı |
| `jszip` | `.stardrop` proje arşivleri; bir tasarım kütüphanesi değil |
| `pdfjs-dist` 5.4.296 | Şema PDF'sinden yerel metin çıkarma; gerektiğinde yüklenen modül/worker |

**Tailwind, Bootstrap, MUI, shadcn, Framer Motion, dnd-kit veya hazır grafik
kütüphanesi kullanmıyoruz.** Sürükleme Pointer Events ile, grafikler küçük SVG
çizimleriyle yapılıyor. React durum/hooks kullanılıyor; Redux/Zustand yok.
Tauri Electron değildir: sistem WebView'ını kullanır; platformlar arası aynı
render/performance sonucunu varsaymayıp hedef makinelerde test etmek gerekir.

## 2. Görsel reçete

- **Ana zemin:** gerçek siyah `#000`. Büyük gri yüzeyler, renkli kartlar,
  cam/blur ve dekoratif gradyanlar ana tasarım dili değil. Mevcut kodda bazı
  kontroller `#050505–#151515` kullanır; bu, gri bir uygulama zemini demek değildir.
- **Ayırma:** ince, çoğunlukla 1 px `#242424–#393939` çizgiler; etkin durumda
  beyaz kenar/sol şerit. Katmanları dev gölgeler yerine boşluk ve sınır ayırır.
- **Metin:** önemli bilgi beyaz; yardımcı metin okunabilir açık tonlarda
  (`#bcbcbc` civarı). Sönük gri yalnız ikincil/etkisiz durumlarda. Hata veya
  güvenlik bilgisi küçük ve silik yazıyla saklanmaz.
- **Renk anlamdır:** yeşil `#30d158` başarılı/bağlı, kırmızı `#ff453a` hata,
  sarı `#ffd60a` uyarı. Aynı anlam her ekranda aynı renk; yanında mutlaka metin/ikon.
  “Bağlı” ile “geçerli ve taze ölçüm geliyor” ayrı durumlardır.
- **Tipografi:** başlık ve kontroller Michroma 400. Etiketlerde yaklaşık
  11–13 px, ana başlıklarda 24–32 px iyi başlangıçtır; uzun teknik adlar kesilir,
  tam adı gerektiğinde gösterilir. Kod, adres, log ve yoğun sayılar monospace.
  Fontu CSS transform ile küçültme, sahte kalınlık üretme; gerçek boyutta çiz.
- **Marka:** büyük harfli, harf aralığı açılmış STARDROP; marka için geniş
  tracking, uzun açıklamalar için değil. Futuristik ama minimal: neon HUD yok.
- **Ölçü/hiyerarşi:** yeni ekranlarda 8/16/24/32 px boşluk ölçeği, 40–48 px
  civarı rahat kontroller, 6–10 px ölçülü köşe yuvarlama başlangıç standardı olsun.
  Bunlar birleştirme önerisidir; mevcut bütün CSS'in tek ölçü sistemi olduğu iddiası değil.
- **Görseller/hareket:** cihaz ekranlarında siyah zemine oturan statik PNG
  görseller; her ekrana büyük hero görseli yok. Animasyon yalnız ilerleme,
  taşıma ve durum geri bildirimi için; azaltılmış hareket tercihini destekle.
- **Yıldızlar:** sabit, çok küçük, beyaz, düşük yoğunluklu SVG noktaları.
  Girişte belirgin, çalışma alanında çok hafif; veri yüzeyleri opak siyah.
  Animasyon döngüsü yok, fareyi yakalamaz, okunabilirliğin önüne geçmez.

## 3. Masaüstü davranışı ve ortak parçalar

**Yerleşim:** solda araç menüsü; sağ üstte sekmeler; sağda yalnız aktif işin
içeriği. Sol altta yukarıdan aşağıya **Bildirimler → Hesap → Cihaz bağlantısı**.
Aynı başlığı üst üste tekrarlama; kullanılmayan üst alanı menüyle doldurma.

Pencerenin işletim sistemi süslemeleri kapalı; taşıma, küçültme, büyütme ve
kapatma `WindowChrome` üzerinden. Gövde sabittir; yalnız içerik, log ve menü
bölgeleri kayar. Touchpad hareketi bütün uygulamayı yerinden oynatmaz.

| Yeniden kullanılacak parça | Sözleşmesi |
| --- | --- |
| `WorkspaceTabs` + belge durumu | Kapat, sırala, yeni sekme; aynı araç iki kez açılınca farklı belge kimliği ve bağımsız form/sonuç |
| Sürükleme + `DragPreview` | Menü öğesini boş/dolu sekmeye bırak; taşınan öğe ve hedef görünür; mevcut belge kurtarılabilir |
| `PanelResize` | Sol menü ve drawer kenarından sürükleme; sınırlandırılmış genişlik yerelde hatırlanır; çift tıkla sıfırla |
| `SelectMenu` | İşletim sisteminin native dropdown'ı yerine ortak siyah combobox; ok tuşları/Escape ve görünür odak |
| `Popup` / drawer | Ortak siyah tasarım; doğru üst katman, Escape/dış tık, odak sınırı ve kapanınca odağın geri dönmesi |
| `NotificationCenter` | Zamanlı geçmiş, merkezi bağlantı bilgisi; ekranı kalıcı başarı mesajlarıyla doldurma |
| Ölçüm kartı | Değişken adı, büyük değer, birim, geçerlilik/tazelik, isteğe bağlı grafik; hedef kart üstte belirgin |
| İşlem görünümü | Hazırla → aktar → doğrula → tamamla; gerçek ilerleme, aşama, açıklamalı hata ve ayrıntı logu |

Sayfa metni seçimi ve inspect kısayolları masaüstünde sınırlandırıldı;
input/textarea içinde yazma, seçme ve kopyalama korunuyor. **Bu bir güvenlik
önlemi değil.** Yeni projelerde klavye erişimini tümden engelleme; Tab,
Escape, odak ve yardımcı teknolojileri gerçekten test et.

## 4. Az yazı, eksiksiz bilgi

Kullanıcıya sırayla **hedef → bağlantı → işlem → sonuç** göster. Wizard'da her
ekran tek karar ister; tek geçerli seçenek varsa gereksiz seçim yaptırma.
Pinout, teknik ayrıntı ve grafik gerektiğinde açılır. Aynı özellik iki rakip
“basit/gelişmiş” ana ekrana bölünmez; tek akışta kademeli açılır.

Birincil buton beyaz, metni siyah; diğerleri siyah ve ince kenarlı. Buton
etiketi eylemdir: “Yazılımı yükle”, “Kaydı başlat”. Etkisiz butonun **neden**
etkisiz olduğu görülebilir. Başarı backend/cihaz onayıyla gösterilir; butona
basmak başarı değildir. Hata gerektiğinde belirir: aşama, sebep, güvenli sonraki
adım ve gerekiyorsa ham hata kodu. Bilinmeyen sonucu “başarılı” diye boyama.

## 5. Performans: görünüm ile veri hızını ayır

**Mevcut:** yıldızlar sabit; PDF modülü sonradan yüklenir; grafik geçmişi son
240 örnekle sınırlı, kayıt üst sınırı ayarlanabilir (varsayılan 2000).
Okuma istekleri birbirini yığmadan sırayla yürür; izleme arka plana geçince
durdurulur. Bunlar düşük hızlı SWD izleme için; yüksek hızlı DAQ çözümü değil.

**Yeni uygulamalar için:** cihazın örnekleme hızı, kalıcı kayıt hızı ve ekran
yenileme hızı ayrı olmalı. Her örneği React state'e basma. Ring buffer,
toplu mesajlar ve görünür pencere kullan; ağır hesap/PDF çözümlemeyi Worker veya
Rust'a taşı. Çok sayıda/hızlı çizgi için Canvas/WebGL yaklaşımını ölçerek seç;
SVG'nin küçük grafikler için yeterli olması büyük DAQ verisine ölçeklendiğini kanıtlamaz.

Ekran için veriyi seyreltebilirsin; kayıt için ham veriyi sessizce atma.
Backpressure, kayıp örnek sayısı ve monoton zaman damgası görünür olmalı.
Başlangıç, frame süresi, CPU/RAM, uçtan uca gecikme ve uzun süreli kayıt
testlerini gerçek Linux/Windows ve hedef donanımda ölç. **“En yüksek performans”
bir görünüm özelliği veya seçilen kütüphanenin garantisi değildir.**

## 6. Ateşleme, şok ve uçuş ekranlarına uyarlama

Görsel dili koru; her ekrana geliştirme aracının davranışlarını aynen taşıma:

- **Motor testi:** hazırlık/armed durumunu, hedefi, bağlantıyı ve izin durumunu
  belirgin göster. Kritik komut yanında tali işlem bulunmasın; onay penceresi
  tek başına fiziksel emniyet/interlock yerine geçmez.
- **Paraşüt şok testi:** tetikleme durumu, kayıt başladı onayı, zaman ekseni,
  tepe değer ve veri kaybı; bağlantı kopunca ölçümü sıfırmış gibi gösterme.
- **Grafik/analiz:** kanallar, birimler, senkron zaman, zoom ve ham veri export;
  hesaplanmış değerleri ham ölçümlerden ayır.
- **Uçuş:** izleme öncelikli düzen. Uçuş sırasında sekme kapatma veya odağın
  değişmesi kayıt/cihaz kontrolünü kesmesin; STARDROP'un “arka planda okumayı
  durdur” kuralını buraya kopyalama. Taze, gecikmiş, geçersiz, bağlantısız ayrı.

STARDROP'taki `hardwareGate` aynı uygulama içinde tek cihaza çakışan işlemleri
engeller. Çok kullanıcı/çok bilgisayar için cihaz/backend yetkilendirmesi de
gerekir; yerel UI kilidi yeterli değildir. UI gerçek zamanlı kontrol döngüsü
veya emniyet otoritesi olmaz. Timeout, tekrar deneme ve komut tekrarını cihaz
tarafında tasarla; kritik fiziksel komutları kendiliğinden yeniden gönderme.

## 7. Yeni proje için teslim kontrolü

Siyah zemin + okunabilir beyaz metin; Michroma + teknik monospace; tek ikon
dili; sabit shell; ortak dropdown/dialog/bildirim; bağımsız belge kimliği;
belirgin hedef; gerçek işlem durumları; taze/geçersiz veri ayrımı; bounded veri
işleme. Ardından klavye, resize, kayıp bağlantı, timeout, yanlış cihaz, eşzamanlı
işlem ve uzun süreli veri testleri. Tasarım değişikliği işlevi azaltmamalı.

**İnsan/LLM için kısa brief:** “STARDROP tarzında bir masaüstü mühendislik
arayüzü yap. React + Tauri, el yazımı CSS, yerel Michroma ve Lucide kullan.
Ana yüzey saf siyah; beyaz tipografi ve ince çizgiler; renk yalnız durum için.
Sabit sol menü, sekmeli çalışma alanı ve ortak siyah pop-up'lar. Her ekranda
tek ana iş; ayrıntılar isteğe bağlı. Hedef cihaz, ölçüm birimi, veri tazeliği
ve hatalar net. Görsel sadeleştirme işlev kaybı yaratmasın. Yüksek hızlı veriyi
React render döngüsünden ayır; kritik kontrol/emniyeti UI'ya bırakma.”

### Kod referansları

Bağımlılıklar: `workbench/package.json`. Tema: `esp-theme.css`,
`premium-black.css`, `readable-type.css`, `workspace-interactions.css`.
Shell: `desktop-viewport.css`, `WindowChrome.jsx`, `WorkspaceTabs.jsx`.
Ortak UI: `Popup.jsx`, `SelectMenu.jsx`, `PanelResize.jsx`, `NotificationCenter.jsx`.
Veri: `GlobalWatch.jsx`, `LiveMonitor.jsx`, `lib/hardwareGate.js`.

Mevcut tema birden fazla CSS override katmanıyla gelişti. Yeni projeye bütün
dosyaları körlemesine taşımak yerine bu sözleşmeyi tek token katmanı ve ortak
bileşen stillerine dönüştür; import sırasına bağımlı renk/font sürprizleri üretme.
