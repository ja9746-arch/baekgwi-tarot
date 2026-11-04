/* 복비 결제 확인 — 토스페이먼츠 (결제창형)
 *
 * 환경변수 두 개가 모두 있을 때만 실제 결제를 받는다. 하나라도 없으면 '데모'로 돌아
 * 지금처럼 '복비 내고 봉인 풀기'를 누르면 바로 유료 풀이로 넘어간다.
 *   TOSS_CLIENT_KEY  결제창 클라이언트 키 (test_gck_… / live_gck_…) — 화면으로 나간다
 *   TOSS_SECRET_KEY  시크릿 키 (test_gsk_… / live_gsk_…) — 서버에서만 쓴다
 *
 * GET  /api/pay              → { mode: "live"|"demo", clientKey }
 * POST /api/pay {paymentKey, orderId, amount, q}
 *      → 토스에 승인을 넣고(이미 승인된 건이면 조회로 확인), 상태와 금액을 맞춰 본 뒤
 *        유료 풀이를 부를 때 쓸 증표(token)를 돌려준다.
 *
 * 화면이 "냈다"고 하는 말은 믿지 않는다. 토스에 직접 물어본 답만 믿는다.
 */
import crypto from "node:crypto";

const PRICES = [3990, 15000];
const TOSS = "https://api.tosspayments.com/v1/payments";

export function payConfig() {
  const clientKey = process.env.TOSS_CLIENT_KEY || "";
  const secret = process.env.TOSS_SECRET_KEY || "";
  return { live: !!(clientKey && secret), clientKey, secret };
}

/* 증표 — 주문번호와 물음에 묶인 서명. 유료 풀이(api/reading)가 이걸 확인한다 */
export function payToken(orderId, q, secret) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${String(q || "").trim()}`).digest("hex").slice(0, 40);
}
export function payTokenOk(pay, q, secret) {
  if (!pay || typeof pay.id !== "string" || typeof pay.token !== "string") return false;
  const want = payToken(pay.id, q, secret);
  const a = Buffer.from(want), b = Buffer.from(pay.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const basic = secret => "Basic " + Buffer.from(secret + ":").toString("base64");

/* 승인을 넣는다. 같은 건을 두 번 승인하려 하면 토스가 막으므로, 그때는 조회로 돌아가
   같은 결제를 확인한다 — 휴대폰에서 돌아오는 길이 두 번 불릴 수 있다 */
async function approve(paymentKey, orderId, amount, secret) {
  try {
    const r = await fetch(`${TOSS}/confirm`, {
      method: "POST",
      headers: { authorization: basic(secret), "content-type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    if (r.ok) return await r.json();
    const e = await r.json().catch(() => ({}));
    console.error("toss confirm", r.status, e?.code, String(e?.message || "").slice(0, 160));
  } catch (e) {
    console.error("toss confirm 끊김", e?.message);
  }
  try {
    const g = await fetch(`${TOSS}/${encodeURIComponent(paymentKey)}`, { headers: { authorization: basic(secret) } });
    if (g.ok) return await g.json();
    console.error("toss lookup", g.status);
  } catch (e) {
    console.error("toss lookup 끊김", e?.message);
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const cfg = payConfig();

  if (req.method === "GET") {
    res.status(200).json(cfg.live ? { mode: "live", clientKey: cfg.clientKey } : { mode: "demo" });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST만 받는다" }); return; }
  if (!cfg.live) { res.status(409).json({ error: "결제가 아직 연결되지 않았다(데모)" }); return; }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { res.status(400).json({ error: "읽을 수 없다" }); return; }
  }
  const paymentKey = String(body?.paymentKey || "").slice(0, 200);
  const orderId = String(body?.orderId || "").slice(0, 64);
  const amount = Number(body?.amount);
  const q = String(body?.q || "").slice(0, 300);

  /* 주문번호는 토스 규칙(영문·숫자·-·_·=, 6~64자) 안에서 우리가 짓는다 */
  if (!/^[A-Za-z0-9_=-]{6,200}$/.test(paymentKey) || !/^bg-[A-Za-z0-9_-]{6,60}$/.test(orderId)
      || !PRICES.includes(amount) || !q.trim()) {
    res.status(400).json({ error: "결제 정보가 맞지 않는다" });
    return;
  }

  const p = await approve(paymentKey, orderId, amount, cfg.secret);
  if (!p) { res.status(402).json({ error: "결제를 찾지 못했다" }); return; }

  if (p.status !== "DONE") {
    res.status(402).json({ error: "결제가 끝나지 않았다", status: String(p.status || "") });
    return;
  }
  const total = Number(p.totalAmount);
  if (total !== amount || !PRICES.includes(total)
      || (p.currency && String(p.currency) !== "KRW")
      || (p.orderId && String(p.orderId) !== orderId)) {
    console.error("toss 금액/주문 어긋남", orderId, total, amount, p.orderId, p.currency);
    res.status(402).json({ error: "결제 금액이 맞지 않는다" });
    return;
  }

  console.log("pay ok", orderId, total);
  res.status(200).json({ ok: true, token: payToken(orderId, q, cfg.secret) });
}
