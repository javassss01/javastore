// JAVASTORE backend — order terbaru yang sudah lunas, untuk notifikasi
// "baru dibeli" di website. HANYA data asli dari database, tanpa data palsu:
// kalau tidak ada order paid dalam 7 hari terakhir, endpoint mengembalikan
// daftar kosong dan website tidak menampilkan notifikasi sama sekali.
// GET tanpa auth — yang dikembalikan hanya produk, durasi, dan waktu bayar;
// TIDAK ada nama, nomor WA, invoice, atau key di sini.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (diisi di dashboard Vercel).
const ALLOWED_ORIGINS = ["https://javassss01.github.io", "https://javascheat.my.id", "https://www.javascheat.my.id"];

// Hanya produk JAVASTORE asli — order asing (mis. Netflix/ChatGPT yang
// pernah muncul di tabel orders) tidak akan pernah ikut tampil.
const REAL_PRODUCTS = ["xreg", "phantom", "ch3atgpt", "drip", "dripclient", "aimhack"];
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari terakhir

function cors(req, res) {
  if (ALLOWED_ORIGINS.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ orders: [] });
  }

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/orders?status=eq.paid&select=product,duration,paid_at&order=paid_at.desc&limit=10&product=in.(${REAL_PRODUCTS.join(",")})`;
    const r = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) throw new Error(JSON.stringify(rows).slice(0, 200));

    const cutoff = Date.now() - WINDOW_MS;
    const orders = (Array.isArray(rows) ? rows : [])
      .filter((o) => o.paid_at && new Date(o.paid_at).getTime() >= cutoff)
      .map((o) => ({ product: o.product, duration: o.duration, paidAt: o.paid_at }));
    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ orders: [], error: "Gagal membaca order", detail: String(e && e.message || e) });
  }
};
