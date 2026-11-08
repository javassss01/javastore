// JAVASTORE backend — ambil key lisensi untuk sebuah transaksi yang sudah lunas.
// Dipanggil halaman pembayaran setelah status berubah LUNAS.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (diisi di dashboard Vercel).
// Hanya mengembalikan key kalau order-nya berstatus paid; satu transactionId
// hanya bisa mengambil key-nya sendiri, dan key yang sama tidak keluar 2x
// karena claim_license_for_transaction sudah menandainya SOLD.
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

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { transactionId } = await readJson(req);
    if (!transactionId) return res.status(400).json({ error: "transactionId wajib diisi" });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Stok belum dikonfigurasi" });
    }

    const url = `${process.env.SUPABASE_URL}/rest/v1/orders?transaction_id=eq.${encodeURIComponent(transactionId)}&select=status,license_code,product,duration`;
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
    return res.status(200).json({
      transactionId,
      status: o.status,
      license_code: o.license_code || null,
      product: o.product,
      duration: o.duration,
    });
  } catch (e) {
    return res.status(500).json({ error: "Gagal mengambil key", detail: String(e && e.message || e) });
  }
};
