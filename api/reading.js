/* 백귀타로 — 풀이 생성
 *
 * 뼈대(시기·확답·붙은 귀·오행 쏠림)는 화면 쪽 코드가 계산해 넘긴다.
 * 여기서는 그 뼈대를 바꾸지 않고, 질문에 맞춰 살만 붙인다.
 * 결제가 끝난 뒤에만 불린다.
 */

/* 백귀사주와 같은 통로를 쓴다. 베르셀 안에서는 열쇠 없이도 붙는다. */
const MODEL = process.env.BAEKGWI_MODEL || "anthropic/claude-haiku-4.5";
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DIRECT = "https://api.anthropic.com/v1/messages";

function route() {
  if (process.env.AI_GATEWAY_API_KEY)
    return { how: "gateway", token: process.env.AI_GATEWAY_API_KEY };
  if (process.env.VERCEL_OIDC_TOKEN)
    return { how: "gateway", token: process.env.VERCEL_OIDC_TOKEN };
  if (process.env.ANTHROPIC_API_KEY)
    return { how: "direct", token: process.env.ANTHROPIC_API_KEY };
  return null;
}

async function callModel(system, prompt) {
  const r = route();
  if (!r) return null;

  if (r.how === "gateway") {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${r.token}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3200,
        temperature: 1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error("gateway", res.status, (await res.text()).slice(0, 400));
      return null;
    }
    const d = await res.json();
    return d?.choices?.[0]?.message?.content || null;
  }

  const res = await fetch(DIRECT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": r.token,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL.replace(/^anthropic\//, ""),
      max_tokens: 3200,
      temperature: 1,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.error("direct", res.status, (await res.text()).slice(0, 400));
    return null;
  }
  const d = await res.json();
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}
const MAX_Q = 200;
const RISK = /죽고\s*싶|자살|목숨을?\s*끊|살기\s*싫|뛰어내리|극단적\s*선택|죽이고\s*싶|죽여\s*버리|해치고\s*싶/;

/* 아주 단순한 주소별 횟수 제한 (한 대에 한정) */
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const win = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
}

const SYSTEM = `너는 '백귀술사 호연(狐煙)'이다. 여우의 연기라는 뜻이다. 사람과 귀신의 경계에서 모습을 드러내는 신령한 여우이며, 안개처럼 나타났다 사라지고, 사람의 말 속에 숨은 마음과 보이지 않는 기운을 읽는 여성 술사다. 해동 백귀야행의 백 귀신을 패에 불러내어 질문자의 지금과 앞으로의 흐름을 읽는다.

너는 상담원이 아니다. 관조하고 짚어주는 술사다.

말투
- 상대를 '자네'라 부른다. 하게체만 쓴다. ~하게, ~일세, ~이네, ~하지, ~로군, ~겠지.
- 낮고 단정하게 말한다. '~일 수도 있다', '~인 것 같다', '아마' 같은 흐린 말은 쓰지 않는다.
- 겁을 주되 반드시 길을 같이 준다. 무섭게 말하고 끝내지 않는다.
- 짧게 끊어 친다. 미사여구를 늘어놓지 않는다.
- 할매·무당 말투, 지역 사투리, 고객센터식 존댓말, 반말 명령조(~해라)는 쓰지 않는다.

반드시 지킬 것
1. 각 자리에는 'base'라는 뼈대 문장이 주어진다. base가 말하는 귀 이름, 갈래, 시기, 확답, 처방은 바꾸지 않는다. 그 뼈대 위에 질문자 사정에 맞는 살을 붙여 다시 쓴다.
2. 질문자가 쓴 말을 그대로 받아서 되짚는다. 그 사람 사정에만 맞는 문장을 쓴다. 누구에게나 들어맞는 일반론은 금지다.
3. 패에 없는 사실, 새로운 시기, 새로운 단정을 지어내지 않는다. 근거는 패의 성질·하는 짓·위험·푸는 법과 뼈대뿐이다.
4. 뒤집혀 나온 패는 '깨어 있다'고 보고 더 빠르고 세게 온다고 푼다.
5. 출전(src)은 귀의 내력을 말할 때만 쓴다. 실제 역사 인물이 한 말인 것처럼 꾸며 인용하지 않는다.
6. 상담기관·신고처 안내는 넣지 않는다. 여기는 점을 보는 자리다.
7. 의료·법률 진단을 내리지 않는다. 기운과 흐름으로만 말한다.
8. 돈을 더 내라거나 다른 상품을 권하지 않는다.
9. 앞서 무료로 열린 세 장(opened)은 이미 손님이 읽었다. 같은 말을 반복하지 말고, 필요하면 "앞서 본 ○○가" 하고 이어 받는다.
10. 자신이나 남의 목숨·몸을 해치는 일을 부추기거나 "되네"로 답하지 않는다. 그런 물음이 섞여 있으면 그 부분은 풀지 않고 다른 자리의 풀이에 집중한다.
11. 건강에 관한 풀이는 병원·진료를 미루라는 말로 읽히지 않게 쓴다.
12. 한 자리당 네 문장에서 여섯 문장. 휴대폰에서 읽기 좋게 문장을 짧게 쓴다.

형식
- 결과는 JSON 배열 하나만 내놓는다. 설명이나 머리말, 코드 울타리를 붙이지 않는다.
- 각 원소는 {"pos":"자리한자","text":"풀이"} 꼴이고, 주어진 순서와 개수를 그대로 지킨다.
- text 안에는 <br>, <em>, <strong> 만 쓸 수 있다. <em>은 귀 이름, <strong>은 못 박는 말(시기·확답·처방)에 쓴다.`;

const TONE = [
  "흐름이 자네 편이다. 담담하게, 그러나 방심하지 말라고 못 박아라.",
  "한 번 꺾였다가 오는 흐름이다. 꺾이는 대목을 분명히 경고하고, 버티는 법을 명하라.",
  "지금 방식으로는 안 된다. 무겁게 경고하되, 바꿔야 할 한 가지를 똑똑히 짚어라.",
  "흐름이 등을 돌렸다. 엄숙하게 판결하듯 짧게 끊되, 끝에는 반드시 살 길 하나를 남겨라.",
];

function buildPrompt(q, cards, bone, stage) {
  const list = cards
    .map(
      (c, i) =>
        `${i + 1}) 자리 ${c.pos} (${c.posDesc})
   패: ${c.nm} · ${c.no} ${c.suit} · 오행 ${c.el} · ${c.rev ? "뒤집힘(깨어남)" : "바로 놓임"}
   출전: ${c.src || "전래"}
   성질: ${c.nature}
   하는 짓: ${c.act}
   위험: ${c.warn}
   푸는 법: ${c.fix}
   base: ${c.base || ""}`
    )
    .join("\n");

  const opened = Array.isArray(bone.opened)
    ? bone.opened.map((o) => `${o.pos} ${o.nm}`).join(", ")
    : "";

  const asked = [
    bone.who ? `- 물음 속 사람: ${bone.who}` : "",
    bone.feel ? `- 물음 속 마음: ${bone.feel}` : "",
    bone.whenWord ? `- 물음 속 때를 가리키는 말: ${bone.whenWord}` : "",
  ].filter(Boolean).join("\n");

  const head = `질문자가 품고 온 물음
"${q}"

가려낸 것
- 주제: ${bone.topic}
- 묻는 꼴: ${bone.qtype}
${asked}`;

  if (stage === "free") {
    return `${head}

지금은 열 장 가운데 앞의 세 장만 무료로 먼저 여는 때다.
- 이 세 장은 이 일의 뿌리(因), 지금 얽힌 것(緣), 자네가 못 보는 것(隱)이다.
- 때(시기)와 확답, 붙은 귀, 떼는 법은 덮인 일곱 장에 있으니 절대 말하지 마라.
- 대신 隱 자리 끝에서 "이 너머에 무엇이 있는지"를 궁금하게 만드는 한 문장으로 맺어라. 돈이나 결제 이야기는 하지 마라.
- 물음 속 사람·마음·사정을 직접 집어 말하라. 질문자가 '이 술사가 내 사정을 안다'고 느껴야 한다.

열린 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 정확히 ${cards.length}개의 풀이를 쓴다.
- 질문에 나온 말을 세 자리 모두에서 직접 되짚어라.`;
  }

  return `${head}
- 이미 무료로 열어 본 세 장: ${opened}

뼈대 (바꾸지 말 것)
- 갈리는 때: ${bone.when.t} (${bone.when.d})
- 확답: ${bone.verdict}
- 확답의 근거: ${(bone.why || []).join(" / ")}
- 열 장 중 오행 ${bone.el}이 ${bone.elN}장으로 가장 많다
- 갈래는 ${bone.leanSuit}가 ${bone.leanN}장으로 가장 많다
- 대귀 ${bone.daegui}장, 뒤집힌 패 ${bone.rev}장

이번 풀이의 결
${TONE[Math.max(0, Math.min(3, Number(bone.grade) || 0))]}

덮여 있던 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 정확히 ${cards.length}개의 풀이를 쓴다.
- 자리 '時'의 풀이에는 "${bone.when.t}"를 그대로 넣는다. 그 밖의 다른 날짜나 달은 지어내지 않는다.
- 자리 '心'에 놓인 귀가 사납더라도, 상대가 그런 사람이라고 단정하지 말고 "그 속에서 이 귀가 하는 짓"으로 푼다.
- 자리 '助'에 놓인 귀는 자네를 돕는 귀가 아니다. 그 귀의 수를 먼저 알아본 눈이 돕는다는 뜻으로 푼다.
- 자리 '果'는 끝의 모양을 풀되 확답("${bone.verdict}")과 어긋나지 않게 쓴다. 확답 문장은 뒤에서 따로 말하니 그대로 옮겨 적지 않는다.
- 자리 '符'는 base에 적힌 두 처방을 질문자의 사정에 맞춰 오늘 당장 할 수 있는 행동으로 풀어 준다. 처방 자체는 바꾸지 않는다.
- 질문에 나온 말을 최소 세 자리 이상에서 직접 되짚어라.
- 묻는 꼴이 '언제'면 時와 果에서 때를 한 번 더 못 박고, '왜'면 鬼에서 까닭을, '어떻게'면 符에서 방법을, '누구'면 心에서 그 사람을, '어느'면 果에서 고른 쪽을 가장 두껍게 써라.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST만 받는다" });
    return;
  }
  if (!route()) {
    res.status(503).json({ error: "통로가 없다" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) {
    res.status(429).json({ error: "너무 잦다. 잠시 뒤에 다시 묻게." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "읽을 수 없다" });
      return;
    }
  }
  const q = String(body?.q || "").slice(0, MAX_Q).trim();
  const cards = Array.isArray(body?.cards) ? body.cards.slice(0, 10) : [];
  const stage = body?.bone?.stage === "free" ? "free" : "paid";
  if (RISK.test(q)) {
    res.status(422).json({ error: "이 물음에는 패를 펴지 않는다" });
    return;
  }
  const bone = body?.bone;
  if (!q || !cards.length || !bone?.when?.t || !bone?.verdict) {
    res.status(400).json({ error: "패가 모자란다" });
    return;
  }

  try {
    const raw = await callModel(SYSTEM, buildPrompt(q, cards, bone, stage));
    if (!raw) {
      res.status(502).json({ error: "패를 읽다 끊겼다" });
      return;
    }

    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end < 0) {
      res.status(502).json({ error: "풀이를 못 알아보겠다" });
      return;
    }
    const sections = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(sections) || sections.length !== cards.length) {
      res.status(502).json({ error: "풀이 수가 맞지 않는다" });
      return;
    }

    const clean = sections.map((s) => ({
      pos: String(s.pos || ""),
      text: String(s.text || "").replace(
        /<(?!\/?(br|em|strong)\b)[^>]*>/gi,
        ""
      ),
    }));

    res.setHeader("cache-control", "no-store");
    res.status(200).json({ sections: clean });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "패를 읽다 끊겼다" });
  }
}
