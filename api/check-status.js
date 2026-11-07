// JAVASTORE backend — cek status pembayaran Casaku (dipakai polling halaman pembayaran)
// Env: CASAKU_LICENSE_KEY (diisi di dashboard Vercel)
const CASAKU_API = "https://api.casaku.id";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://javassss01.github.io");
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
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { transactionId } = await readJson(req);
    if (!transactionId) return res.status(400).json({ error: "transactionId wajib diisi" });
    if (!process.env.CASAKU_LICENSE_KEY) {
      return res.status(500).json({ error: "Backend belum dikonfigurasi (CASAKU_LICENSE_KEY)" });
    }

    const r = await fetch(`${CASAKU_API}/api/generate/check-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-license-key": process.env.CASAKU_LICENSE_KEY,
      },
      body: JSON.stringify({ transactionId }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: "Casaku menolak request", detail: data.message || data });
    }

    const d = data.data || data;
    const status = d.status || "pending"; // pending | paid | cancel | expired
    return res.status(200).json({
      transactionId,
      status,
      amount: d.amount || null,
      paidAt: d.paidAt || d.paid_at || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "Gagal cek status", detail: String(e && e.message || e) });
  }
};
