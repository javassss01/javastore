// JAVASTORE backend — stok live: jumlah key AVAILABLE per produk+durasi.
// GET tanpa auth — angkanya memang untuk ditampilkan ke pembeli di website.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (diisi di dashboard Vercel).
const ALLOWED_ORIGINS = ["https://javassss01.github.io", "https://javascheat.my.id", "https://www.javascheat.my.id"];

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
    return res.status(200).json({ stock: {} });
  }

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/licenses?status=eq.AVAILABLE&select=product,duration&limit=1000`;
    const r = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) throw new Error(JSON.stringify(rows).slice(0, 200));

    const stock = {};
    for (const row of rows) {
      const k = `${row.product}|${row.duration}`;
      stock[k] = (stock[k] || 0) + 1;
    }
    return res.status(200).json({ stock, updatedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ stock: {}, error: "Gagal membaca stok", detail: String(e && e.message || e) });
  }
};
