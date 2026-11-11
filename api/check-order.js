// JAVASTORE backend — cek pesanan: status + key lisensi lewat nomor invoice.
// Buyer yang halaman pembayarannya tertutup bisa cek sendiri pakai invoice
// dan nomor WA yang dipakai saat checkout.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (diisi di dashboard Vercel).
// PENGAMAN (anti-IDOR, sama seperti get-key): invoice saja tidak cukup —
// nomor WA yang dikirim harus cocok dengan WA di order, kalau tidak server
// menolak dengan pesan generik yang sama seperti invoice tidak ditemukan.
// Key hanya diberikan kalau order berstatus paid.
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
function normalizeWa(wa) {
  const d = String(wa || "").replace(/\D/g, "");
  if (d.startsWith("62")) return "0" + d.slice(2);
  return d;
}

// Anti-spam: batasi 20x cek pesanan per IP tiap 10 menit.
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

// Pesan generik untuk invoice tidak ditemukan ATAU WA tidak cocok —
// supaya tidak bisa dipakai untuk menebak invoice orang lain.
const NOT_FOUND = "Pesanan tidak ditemukan atau nomor WhatsApp tidak cocok";

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi beberapa menit lagi" });

  try {
    const { invoice, wa } = await readJson(req);
    if (!invoice) return res.status(400).json({ error: "invoice wajib diisi" });
    if (!wa) return res.status(400).json({ error: "wa wajib diisi" });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Stok belum dikonfigurasi" });
    }

    const url = `${process.env.SUPABASE_URL}/rest/v1/orders?invoice=eq.${encodeURIComponent(String(invoice).trim().toUpperCase())}&select=status,license_code,product,duration,amount,wa,name,paid_at,created_at`;
    const r = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) throw new Error(JSON.stringify(rows).slice(0, 200));
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: NOT_FOUND });
    }

    const o = rows[0];
    // Cek pemilik: WA yang dikirim harus sama dengan WA di order.
    if (!o.wa || normalizeWa(wa) !== normalizeWa(o.wa)) {
      return res.status(404).json({ error: NOT_FOUND });
    }
    // Key hanya keluar kalau order sudah paid.
    const isPaid = o.status === "paid";
    return res.status(200).json({
      invoice: String(invoice).trim().toUpperCase(),
      status: o.status,
      product: o.product,
      duration: o.duration,
      amount: o.amount,
      name: o.name,
      paidAt: o.paid_at || null,
      createdAt: o.created_at || null,
      license_code: isPaid ? (o.license_code || null) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Gagal mengecek pesanan", detail: String(e && e.message || e) });
  }
};
