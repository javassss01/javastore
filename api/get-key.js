// JAVASTORE backend — ambil key lisensi untuk sebuah transaksi yang sudah lunas.
// Dipanggil halaman pembayaran setelah status berubah LUNAS.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (diisi di dashboard Vercel).
// PENGAMAN (anti-IDOR): key hanya diberikan kalau nomor WA yang dikirim cocok
// dengan nomor WA yang dipakai saat checkout DAN order berstatus paid.
// transactionId saja tidak cukup — tanpa WA yang cocok, server menolak (403).
// Key yang sama tidak keluar 2x karena claim_license_for_transaction sudah
// menandainya SOLD.
const ALLOWED_ORIGINS = ["https://javassss01.github.io", "https://javascheat.my.id", "https://www.javascheat.my.id"];

function cors(req, res) {
  if (ALLOWED_ORIGINS.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// Samakan format nomor WA: buang spasi/tanda, ubah awalan 62 jadi 0.
// "0819...", "+62819..." dan "62819..." semuanya jadi "0819...".
function normalizeWa(wa) {
  const d = String(wa || "").replace(/\D/g, "");
  if (d.startsWith("62")) return "0" + d.slice(2);
  return d;
}

// Anti-spam: batasi 20x minta key per IP tiap 10 menit. Pemakaian normal
// cuma ~4x per order lunas, jadi batas ini longgar buat buyer asli.
const RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT.max;
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi beberapa menit lagi" });

  try {
    const { transactionId, wa } = await readJson(req);
    if (!transactionId) return res.status(400).json({ error: "transactionId wajib diisi" });
    if (!wa) return res.status(400).json({ error: "wa wajib diisi" });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Stok belum dikonfigurasi" });
    }

    const url = `${process.env.SUPABASE_URL}/rest/v1/orders?transaction_id=eq.${encodeURIComponent(transactionId)}&select=status,license_code,product,duration,wa`;
    const r = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) throw new Error(JSON.stringify(rows).slice(0, 200));
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }

    const o = rows[0];
    // Cek pemilik: WA yang dikirim harus sama dengan WA di order.
    if (!o.wa || normalizeWa(wa) !== normalizeWa(o.wa)) {
      return res.status(403).json({ error: "Akses ditolak" });
    }
    // Key hanya keluar kalau order sudah paid. Order pending/expired/cancel
    // selalu mengembalikan license_code null (key belum di-claim webhook).
    const isPaid = o.status === "paid";
    return res.status(200).json({
      transactionId,
      status: o.status,
      license_code: isPaid ? (o.license_code || null) : null,
      product: o.product,
      duration: o.duration,
    });
  } catch (e) {
    return res.status(500).json({ error: "Gagal mengambil key", detail: String(e && e.message || e) });
  }
};
