// JAVASTORE backend — penerima webhook Casaku (notifikasi saat transaksi lunas)
// Env: CASAKU_WEBHOOK_SECRET (diisi di dashboard Vercel)
// Casaku mengirim POST dengan header X-Casaku-Signature = HMAC-SHA256(raw body, secret).
// Saat paid: verifikasi signature, lalu klaim 1 key stok dari Supabase untuk
// transaksi itu (claim_license_for_transaction). Pembeli mengambil key-nya
// lewat api/get-key.js. Kalau stok habis, order tetap lunas dan admin kirim manual.
const crypto = require("crypto");

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Supabase (opsional — kalau env var belum diisi, webhook tetap balas 200).
async function sbRpc(fn, args) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(JSON.stringify(data).slice(0, 200));
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const raw = await readRaw(req);
    let signature = req.headers["x-casaku-signature"] || "";
    // Casaku mengirim signature sebagai "hmac-sha256=<hex>" (lihat PAYLOAD
    // PREVIEW di halaman Webhook Developer) — buang prefix algoritmanya
    // sebelum dibandingkan, supaya cocok dengan HMAC yang kita hitung.
    const eq = signature.indexOf("=");
    if (eq !== -1) signature = signature.slice(eq + 1);
    signature = signature.trim();
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
      console.log("PAID:", payload.transactionId, "amount:", payload.amount, "paidAt:", payload.paidAt);
      // Klaim 1 key stok untuk transaksi ini (atomik, idempotent).
      // Kalau Supabase belum dikonfigurasi / stok habis, order tetap tercatat
      // lunas di log dan admin mengirim key manual.
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && payload.transactionId) {
        try {
          const code = await sbRpc("claim_license_for_transaction", { p_transaction_id: payload.transactionId });
          console.log("KEY CLAIMED:", payload.transactionId, "->", code || "(stok habis / order tidak ditemukan)");
        } catch (e) {
          console.warn("Klaim key gagal:", String(e).slice(0, 200));
        }
      }
    }

    // Balas 200 secepatnya (Casaku retry kalau >10 detik tanpa 2xx).
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal proses webhook", detail: String(e && e.message || e) });
  }
};

module.exports.config = { api: { bodyParser: false } };
