# JAVASTORE — Website (GitHub Pages)

Website statis untuk JAVASTORE. Tanpa database, tanpa payment gateway.
Order masuk WhatsApp **0819-1273-3875** (wa.me/6281912733875).

## Isi folder ini
- `index.html` — seluruh website (1 file)
- `images/xreg.jpg` — gambar X REG
- `images/phantom.jpg` — gambar PHANTOM Free Fire
- `images/drip.jpg` — gambar DRIP WIRE / DRIP CLIENT
- `.nojekyll` — supaya GitHub Pages tidak mengabaikan file
- `README.md` — file ini

Produk & harga ada di `index.html` (bagian `PRODUCTS` di `<script>`).
CH3AT GPT tidak punya gambar, jadi tampil sebagai kartu placeholder hijau.

## Deploy ke GitHub Pages dari HP (Android Chrome)

1. Buka github.com, login, buat repository baru, misal nama `javastore`.
   - Public, centang "Add a README file" boleh, tidak wajib.
2. Di repo itu, klik **Add file → Upload files**, upload SEMUA isi folder ini:
   `index.html`, folder `images/` (3 gambar), dan `.nojekyll`.
   - Catatan: file `.nojekyll` diawali titik, kadang tidak terlihat di file manager HP.
     Kalau tidak bisa upload file itu, tidak apa-apa — website tetap jalan.
     Upload saja `index.html` + folder `images/`.
   - Jangan upload file ZIP-nya langsung, upload isinya (extract dulu di HP).
3. Klik **Commit changes**.
4. Masuk **Settings → Pages** (di repo yang sama).
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**, klik **Save**.
5. Tunggu 1–2 menit, buka link yang muncul di atas halaman Pages,
   biasanya `https://<username>.github.io/javastore/`

## Pasang domain sendiri nanti

Kalau domainmu sudah siap, kirim nama domainnya ke Muse.
Langkah umumnya (di GitHub Pages):
1. Di **Settings → Pages → Custom domain**, isi domainmu, klik **Save**.
   GitHub akan membuat file `CNAME` otomatis di repo.
2. Di tempat kamu beli domain (registrar), atur DNS:
   - Untuk subdomain `www`: CNAME `www` → `<username>.github.io`
   - Untuk domain utama (apex, tanpa www): A record ke IP GitHub Pages
     (cek IP terbaru di docs GitHub Pages saat itu).
3. Tunggu DNS menyebar (biasanya menit–jam), lalu centang **Enforce HTTPS** di Pages.

Jangan kirim password GitHub / registrar lewat chat.
