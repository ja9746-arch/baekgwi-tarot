/* 복비 결제 확인 — 포트원(PortOne) V2
 *
 * 환경변수 세 개가 모두 있을 때만 실제 결제를 받는다. 하나라도 없으면 '데모'로 돌아
 * 지금처럼 '복비 내고 봉인 풀기'를 누르면 바로 유료 풀이로 넘어간다.
 *   PORTONE_STORE_ID     상점 아이디 (store-...)
 *   PORTONE_CHANNEL_KEY  채널 키 (channel-key-...)
 *   PORTONE_API_SECRET   V2 API 시크릿 (서버에서만 쓴다, 화면으로 내보내지 않는다)
 *
 * GET  /api/pay              → { mode: "live"|"demo", storeId, channelKey }
 * POST /api/pay {paymentId, amount, q}
 *      → 포트원에서 결제 건을 직접 조회해 '결제 완료'와 금액을 확인한 뒤,
 *        유료 풀이를 부를 때 쓸 증표(token)를 돌려준다.
 */
import crypto from "node:crypto";

const PRICES = [3990, 15000];

export function payConfig() {
  const storeId = process.env.PORTONE_STORE_ID || "";
  const channelKey = process.env.PORTONE_CHANNEL_KEY || "";
  const secret = process.env.PORTONE_API_SECRET || "";
  return { live: !!(storeId && channelKey && secret), storeId, channelKey, secret };
}

/* 증표 — 결제 건과 물음에 묶인 서명. 유료 풀이(api/reading)가 이걸 확인한다 */
export function payToken(paymentId, q, secret) {
  return crypto.createHmac("sha256", secret).update(`${paymentId}|${String(q || "").trim()}`).digest("hex").slice(0, 40);
}
export function payTokenOk(pay, q, secret) {
  if (!pay || typeof pay.id !== "string" || typeof pay.token !== "string") return false;
  const want = payToken(pay.id, q, secret);
  const a = Buffer.from(want), b = Buffer.from(pay.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const cfg = payConfig();
  if (req.method === "GET") {
    res.status(200).json(cfg.live ? { mode: "live", storeId: cfg.storeId, channelKey: cfg.channelKey } : { mode: "demo" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST만 받는다" });
    return;
  }
  if (!cfg.live) {
    res.status(409).json({ error: "결제가 아직 연결되지 않았다(데모)" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: "읽을 수 없다" }); return; }
  }
  const paymentId = String(body?.paymentId || "").slice(0, 80);
  const amount = Number(body?.amount);
  const q = String(body?.q || "").slice(0, 300);
  if (!/^bg-[A-Za-z0-9_-]{6,70}$/.test(paymentId) || !PRICES.includes(amount) || !q.trim()) {
    res.status(400).json({ error: "결제 정보가 맞지 않는다" });
    return;
  }
  try {
    const r = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `PortOne ${cfg.secret}` },
    });
    if (!r.ok) {
      console.error("pay lookup", r.status, (await r.text()).slice(0, 300));
      res.status(402).json({ error: "결제를 찾지 못했다" });
      return;
    }
    const p = await r.json();
    const total = Number(p?.amount?.total);
    if (p?.status !== "PAID") {
      res.status(402).json({ error: "결제가 끝나지 않았다", status: p?.status || "" });
      return;
    }
    if (total !== amount || !PRICES.includes(total) || (p?.currency && !/KRW/.test(String(p.currency)))) {
      console.error("pay amount mismatch", paymentId, total, amount);
      res.status(402).json({ error: "결제 금액이 맞지 않는다" });
      return;
    }
    console.log("pay ok", paymentId, total);
    res.status(200).json({ ok: true, token: payToken(paymentId, q, cfg.secret) });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "결제 확인이 끊겼다" });
  }
}
