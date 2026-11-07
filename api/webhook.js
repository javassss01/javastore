// JAVASTORE backend — penerima webhook Casaku (notifikasi saat transaksi lunas)
// Env: CASAKU_WEBHOOK_SECRET (diisi di dashboard Vercel)
// Casaku mengirim POST dengan header X-Casaku-Signature = HMAC-SHA256(raw body, secret).
// Untuk sekarang endpoint ini hanya verifikasi signature dan mencatat pembayaran lunas.
// Nanti kalau stok key sudah ada + database order sudah dipasang, di sinilah
// order diubah jadi PAID dan key otomatis dikirim ke pembeli.
const crypto = require("crypto");

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const raw = await readRaw(req);
    const signature = req.headers["x-casaku-signature"] || "";
    const secret = process.env.CASAKU_WEBHOOK_SECRET || "";

    if (!secret) return res.status(500).json({ error: "Webhook belum dikonfigurasi" });

    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    let valid = false;
    try {
      valid =
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch (_) {
      valid = false;
    }
    if (!valid) return res.status(401).json({ error: "Invalid signature" });

    const payload = JSON.parse(raw.toString("utf8"));
    if (payload.status === "paid") {
      // TODO (nanti): update order jadi PAID di database + kirim key otomatis.
      console.log("PAID:", payload.transactionId, "amount:", payload.amount, "paidAt:", payload.paidAt);
    }

    // Balas 200 secepatnya (Casaku retry kalau >10 detik tanpa 2xx).
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal proses webhook", detail: String(e && e.message || e) });
  }
};

module.exports.config = { api: { bodyParser: false } };
