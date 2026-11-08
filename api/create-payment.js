// JAVASTORE backend — Casaku QRIS proxy (Vercel Serverless Functions, Node, no deps)
// Env vars (diisi di dashboard Vercel, JANGAN taruh di repo / chat):
//   CASAKU_LICENSE_KEY  — License Key dari casaku.id/api-keys
//   CASAKU_QR_ID        — ID QRIS Merchant (UUID) dari casaku.id/qris
//   CASAKU_WEBHOOK_SECRET — Webhook Secret dari casaku.id/api-keys (untuk api/webhook.js)
// Harga resmi JAVASTORE — dipakai untuk validasi nominal supaya tidak bisa diubah dari browser.
const PRICES = {
  xreg: [5000, 8000, 12000, 15000, 20000, 40000, 70000, 130000],
  phantom: [4000, 6000, 10000, 12000, 18000, 25000, 40000, 80000],
  ch3atgpt: [14000, 36000, 70000, 80000, 200000],
  drip: [4000, 7000, 10000, 15000, 50000, 130000],
  dripclient: [10000, 20000, 45000, 70000, 80000],
};

const CASAKU_API = "https://api.casaku.id";

// MAINTENANCE: isi id produk yang lagi maintenance, misal new Set(["xreg"]) —
// request untuk produk itu ditolak supaya tidak bisa beli lewat API langsung.
// Samakan dengan maintenance:true di index.html.
const MAINTENANCE = new Set([]);

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

// Anti-spam order: batasi 10x buat QRIS per IP tiap 10 menit.
// Pengaman dasar — tiap instance serverless punya hitungannya sendiri,
// jadi rate limiting Cloudflare tetap jadi lapisan utamanya.
const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT.max;
}

// Supabase (opsional — kalau env var belum diisi, toko tetap jalan manual).
// Dipakai untuk mencatat order + mengecek stok key. Server-side saja.
async function sbCall(path, method, body) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(data).slice(0, 200));
  return data;
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi beberapa menit lagi" });

  try {
    const { invoice, product, duration, amount, name, wa } = await readJson(req);

    // Validasi: produk + nominal harus cocok dengan price list resmi.
    const allowed = PRICES[product];
    if (!allowed || !allowed.includes(Number(amount))) {
      return res.status(400).json({ error: "Produk atau nominal tidak valid" });
    }
    if (MAINTENANCE.has(product)) {
      return res.status(503).json({ error: "Produk sedang maintenance" });
    }
    if (!invoice || !name || !wa) {
      return res.status(400).json({ error: "Data pesanan tidak lengkap" });
    }
    if (!process.env.CASAKU_LICENSE_KEY || !process.env.CASAKU_QR_ID) {
      return res.status(500).json({ error: "Backend belum dikonfigurasi (CASAKU_LICENSE_KEY / CASAKU_QR_ID)" });
    }

    const r = await fetch(`${CASAKU_API}/api/generate/v2/qris`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-license-key": process.env.CASAKU_LICENSE_KEY,
      },
      body: JSON.stringify({
        qr_id: process.env.CASAKU_QR_ID,
        amount: Number(amount),
        useUniqueCode: true, // kode unik 1-999 di belakang nominal, biar tiap order beda
        packageIds: ["id.dana"], // QRIS DANA Bisnis
        expiredInMinutes: 20, // sama dengan countdown di halaman pembayaran
        qrType: "dynamic",
        paymentMethod: "qris",
        useQris: true,
        prefix: "JVS",
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: "Casaku menolak request", detail: data.message || data });
    }

    const d = data.data || data;
    const qrString = d.qr_string || d.qrString || d.qr || "";
    const transactionId = d.transactionId || d.transaction_id || d.id || "";
    const totalAmount = d.totalAmount || d.total_amount || d.amount || Number(amount);
    if (!qrString || !transactionId) {
      return res.status(502).json({ error: "Respons Casaku tidak lengkap", detail: data });
    }

    // Stok: catat order + cek apakah ada key tersedia untuk produk+durasi ini.
    // Gagal ke Supabase tidak boleh menggagalkan pembayaran — fallback ke manual.
    let hasStock = false;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await sbCall("orders", "POST", { invoice, transaction_id: transactionId, product, duration, amount: totalAmount, name, wa, status: "pending" });
      } catch (e) { console.warn("Supabase order insert gagal:", String(e).slice(0, 120)); }
      try {
        const stock = await sbCall(`licenses?product=eq.${encodeURIComponent(product)}&duration=eq.${encodeURIComponent(duration)}&status=eq.AVAILABLE&select=id&limit=1`, "GET");
        hasStock = Array.isArray(stock) && stock.length > 0;
      } catch (e) { console.warn("Supabase stock check gagal:", String(e).slice(0, 120)); }
    }

    return res.status(200).json({
      transactionId,
      qr_string: qrString,
      totalAmount,
      invoice,
      product,
      duration,
      hasStock,
      expiresAt: d.expiredAt || d.expired_at || new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: "Gagal membuat pembayaran", detail: String(e && e.message || e) });
  }
};
