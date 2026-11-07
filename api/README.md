# JAVASTORE — Backend Otomatis Casaku (Vercel)

Backend kecil ini yang bikin pembayaran JAVASTORE jadi otomatis:
pembeli checkout → QRIS dinamis dibuat per order (nominal + kode unik) →
halaman pembayaran ngecek status tiap 5 detik → kalau lunas, status berubah
jadi LUNAS tanpa kamu cek manual.

## File

- `api/create-payment.js` — POST: validasi produk/nominal, panggil Casaku
  Generate QRIS v2, balas `transactionId`, `qr_string`, `totalAmount`.
- `api/check-status.js` — POST `{transactionId}`: tanya Casaku, balas
  status `pending | paid | cancel | expired`.
- `api/webhook.js` — POST dari Casaku saat transaksi lunas. Verifikasi
  HMAC-SHA256 pakai `CASAKU_WEBHOOK_SECRET`. Untuk sekarang hanya mencatat;
  nanti di sinilah order diubah PAID + key dikirim otomatis (butuh database
  order + stok key — belum ada, Javas belum beli stok).

## Env vars (WAJIB diisi di dashboard Vercel, jangan di repo/chat)

| Nama | Dari mana |
|---|---|
| `CASAKU_LICENSE_KEY` | casaku.id → API Keys → License Key |
| `CASAKU_QR_ID` | casaku.id → QRIS Saya → ID QRIS Merchant (UUID) |
| `CASAKU_WEBHOOK_SECRET` | casaku.id → API Keys → Webhook Secret |

## Deploy (sekali saja)

1. Di Vercel (vercel.com), **Add New → Project → Import** repo
   `javassss01/javastore` (GitHub).
2. Framework Preset: **Other**. Root Directory: `./` (default).
3. Di **Environment Variables**, isi 3 env var di atas, lalu **Deploy**.
4. Catat URL backend-nya, misal `https://javastore.vercel.app`.
5. Di `index.html`, isi `BACKEND_URL` dengan URL itu (tanpa `/` di akhir),
   lalu push lagi ke GitHub. Kalau `BACKEND_URL` kosong, website tetap jalan
   dengan QRIS statis + konfirmasi manual WA seperti sebelumnya.

## Webhook URL (di dashboard Casaku → Webhook Developer)

`https://<url-vercel-kamu>/api/webhook`

## Yang HARUS dilakukan Javas dulu di Casaku (tidak bisa diwakilkan)

1. Daftar di [casaku.id](https://casaku.id)
2. Upload QRIS DANA Bisnis di [casaku.id/qris](https://casaku.id/qris)
3. Generate **License Key & Webhook Secret** di
   [casaku.id/api-keys](https://casaku.id/api-keys)
4. Install aplikasi **"Casaku : Gateway Qris"** di Play Store, login akun
   yang sama, masuk tab Setting, nyalakan Listener, pastikan semua
   checklist HIJAU dan sumber QRIS = DANA.
5. HP yang dipasangi aplikasi Casaku harus **selalu nyala + online** —
   kalau HP mati, pembayaran tidak terdeteksi otomatis.

## Batasan yang masih berlaku

- **Pengiriman key masih manual.** Pembeli klik "SAYA SUDAH BAYAR" → WA
  masuk ke kamu → kamu kirim key manual. Otomatis penuh (key terkirim
  sendiri setelah lunas) baru bisa setelah kamu join reseller, beli stok key,
  dan database order dipasang.
- Jangan pernah kirim License Key / Webhook Secret lewat chat — isikan
  langsung di dashboard Vercel.
