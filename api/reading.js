/* 백귀타로 — 풀이 생성
 *
 * 뼈대(시기·확답·붙은 귀·오행 쏠림)는 화면 쪽 코드가 계산해 넘긴다.
 * 여기서는 그 뼈대를 바꾸지 않고, 질문에 맞춰 살만 붙인다.
 * 결제가 끝난 뒤에만 불린다.
 */

const MODEL = process.env.BAEKGWI_MODEL || "claude-sonnet-5-5";
const MAX_Q = 200;

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

const SYSTEM = `너는 '백귀술사 호연(狐煙)'이다. 여우의 연기라는 뜻이고, 사람과 귀신의 경계에서 말 속에 숨은 마음과 보이지 않는 기운을 읽는 여성 술사다.

말투
- 상대를 '자네'라 부른다. 하게체를 쓴다. ~하게, ~일세, ~이네, ~하지, ~로군.
- 단정적으로 말한다. '~일 수도 있다', '~인 것 같다' 같은 흐린 말은 쓰지 않는다.
- 겁을 주되 반드시 길을 같이 준다. 무섭게 말하고 끝내지 않는다.
- 짧고 세게 끊어 친다. 미사여구를 늘어놓지 않는다.

반드시 지킬 것
1. 질문자가 쓴 말을 그대로 받아서 되짚는다. 그 사람의 사정에만 맞는 문장을 쓴다. 누구에게나 들어맞는 일반론은 금지다.
2. 넘겨받은 '뼈대'의 시기와 확답은 글자 그대로 쓴다. 바꾸거나 흐리지 않는다.
3. 각 자리의 풀이는 그 자리에 나온 패의 성질(nature·act·warn·fix)에 근거해야 한다. 패에 없는 소리를 지어내지 않는다.
4. 뒤집혀 나온 패(rev)는 '깨어 있다'고 보고 더 빠르고 세게 온다고 푼다.
5. 상담기관·신고처 안내는 넣지 않는다. 여기는 점을 보는 자리다.
6. 의료·법률 진단을 내리지 않는다. 기운과 흐름으로만 말한다.
7. 한 자리당 세 문장에서 다섯 문장. 짧으면 손님이 돈이 아깝다 여긴다.

형식
- 결과는 JSON 배열 하나만 내놓는다. 설명이나 머리말을 붙이지 않는다.
- 각 원소는 {"pos":"자리한자","text":"풀이"} 꼴이다.
- text 안에는 <br>, <em>, <strong> 만 쓸 수 있다. <em>은 귀 이름, <strong>은 못 박는 말에 쓴다.`;

function buildPrompt(q, cards, bone) {
  const list = cards
    .map(
      (c, i) =>
        `${i + 1}) 자리 ${c.pos} (${c.posDesc})
   패: ${c.nm}(${c.jp}) ${c.hanja} · ${c.no} ${c.suit} · 오행 ${c.el} · ${c.rev ? "뒤집힘(깨어남)" : "바로 놓임"}
   성질: ${c.nature}
   하는 짓: ${c.act}
   위험: ${c.warn}
   푸는 법: ${c.fix}`
    )
    .join("\n");

  return `질문자가 품고 온 물음
"${q}"

가려낸 것
- 주제: ${bone.topic}
- 묻는 꼴: ${bone.qtype}

뼈대 (바꾸지 말 것)
- 갈리는 때: ${bone.when.t} (${bone.when.d})
- 확답: ${bone.verdict}
- 열 장 중 오행 ${bone.el}이 ${bone.elN}장으로 가장 많다
- 갈래는 ${bone.leanSuit}가 ${bone.leanN}장으로 가장 많다
- 대귀 ${bone.daegui}장, 뒤집힌 패 ${bone.rev}장

덮여 있던 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 ${cards.length}개의 풀이를 쓴다.
- 자리 '時'의 풀이에는 "${bone.when.t}"를 그대로 넣는다.
- 자리 '果'의 풀이는 "${bone.verdict}"로 끝맺는다. 이 문장은 <strong>으로 감싼다.
- 자리 '符'는 그 패의 '푸는 법'을 질문자의 사정에 맞춰 구체적인 행동 하나로 바꿔 준다.
- 질문에 나온 말을 최소 세 자리 이상에서 직접 되짚어라.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST만 받는다" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(503).json({ error: "열쇠가 없다" });
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
  const bone = body?.bone;
  if (!q || !cards.length || !bone?.when?.t || !bone?.verdict) {
    res.status(400).json({ error: "패가 모자란다" });
    return;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        temperature: 1,
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(q, cards, bone) }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("model error", r.status, t.slice(0, 400));
      res.status(502).json({ error: "패를 읽다 끊겼다" });
      return;
    }

    const data = await r.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

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
