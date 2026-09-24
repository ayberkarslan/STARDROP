# STARDROP GitHub giriş köprüsü

Bu Worker, GitHub App web authorization akışının `/callback` adresidir. Client secret **yalnızca** Cloudflare Secret binding olarak `GITHUB_CLIENT_SECRET` adıyla tutulur. Public Client ID, `GITHUB_CLIENT_ID` adlı normal değişkendir.

GitHub App callback URL: `https://stardrop-auth.ayberkarslann0.workers.dev/callback`.

Cloudflare dashboard'da `stardrop-auth` Worker'ının kodunu `src/index.js` içeriğiyle değiştirip deploy edin. `GITHUB_CLIENT_ID` ve `GITHUB_CLIENT_SECRET` ayarlandıktan sonra masaüstü uygulaması `/start` üzerinden tarayıcıyı açar. Callback, kısa ömürlü yetkilendirme kodunu sadece `127.0.0.1` üzerindeki rastgele porta döndürür; `/exchange` bu kodu Worker'daki gizli anahtarla token'a çevirir. Secret'ı kaynak koda veya masaüstü uygulamasına koymayın.
