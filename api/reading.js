/* 백귀타로 — 풀이 생성
 *
 * 뼈대(시기·확답·붙은 귀·오행 쏠림)는 화면 쪽 코드가 계산해 넘긴다.
 * 여기서는 그 뼈대를 바꾸지 않고, 질문에 맞춰 살만 붙인다.
 * 결제가 끝난 뒤에만 불린다.
 */

/* 백귀사주와 같은 통로를 쓴다. 베르셀 안에서는 열쇠 없이도 붙는다. */
import { payConfig, payTokenOk } from "./pay.js";

const MODEL = process.env.BAEKGWI_MODEL || "anthropic/claude-haiku-4.5";
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DIRECT = "https://api.anthropic.com/v1/messages";

/* 베르셀 함수 안에서는 OIDC 열쇠가 요청 머리(x-vercel-oidc-token)로 들어온다. */
function route(req) {
  const hdr = req?.headers?.["x-vercel-oidc-token"];
  if (process.env.AI_GATEWAY_API_KEY)
    return { how: "gateway", token: process.env.AI_GATEWAY_API_KEY };
  if (hdr) return { how: "gateway", token: hdr };
  if (process.env.VERCEL_OIDC_TOKEN)
    return { how: "gateway", token: process.env.VERCEL_OIDC_TOKEN };
  if (process.env.ANTHROPIC_API_KEY)
    return { how: "direct", token: process.env.ANTHROPIC_API_KEY };
  return null;
}

/* 모델이 글 속에 큰따옴표를 그대로 넣어 JSON이 깨지는 일이 있다 — 그때는 자리별로 떼어 읽는다 */
function parseSections(txt) {
  try {
    return JSON.parse(txt);
  } catch {}
  const out = [];
  const re = /\{\s*"pos"\s*:\s*"([^"]{0,8})"\s*,\s*"text"\s*:\s*"([\s\S]*?)"\s*\}\s*(?=,\s*\{|\s*\]\s*$)/g;
  let m;
  while ((m = re.exec(txt))) {
    out.push({
      pos: m[1],
      text: m[2].replace(/\\n/g, "<br>").replace(/\\"/g, "'").replace(/"/g, "'").replace(/\\\\/g, "\\"),
    });
  }
  return out;
}

async function callModel(req, system, prompt, maxTok = 3200) {
  const r = route(req);
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
        max_tokens: maxTok,
        temperature: 1,
        /* 개인정보처리방침에 적은 대로 Anthropic으로만 보낸다(다른 공급자로 돌리지 않는다) */
        providerOptions: { gateway: { only: ["anthropic"] } },
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
      max_tokens: maxTok,
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
const RISK = /살\s*이유(가)?\s*(없|있을까|모르)|사는\s*(게|의미가)\s*(의미|무슨\s*의미|없)|(다|전부|모든\s*걸)\s*포기하고\s*싶(어|다|네|어요|습니다)?\s*[.!?…ㅠㅜ ]*$|안\s*깨어났으면|눈\s*뜨지\s*않았으면|없어지는\s*게\s*나을|태어나지\s*말|죽고\s*싶|자살|목숨을?\s*끊|(?<!(혼자|같이|따로|서울|지방|시골|여기|거기|시댁|본가|이\s*집|그\s*집|한국)\s*)살기\s*싫|살고\s*싶지\s*않|사라지고\s*싶|뛰어내[리릴려]|극단적인?\s*선택|자해|손목\s*(을|를)?\s*긋|목\s*(을|를)?\s*매|번개탄|(?<![가-힣])유서|약을?\s*(다|한꺼번에|몽땅|많이|잔뜩)\s*(먹|삼키)|죽어\s*버릴|죽이고\s*싶|죽여\s*버리|죽일까|해치고\s*싶|복수하고\s*싶/;

/* 귀 이름 뒤 괄호 한자는 화면 카드에 이미 있다 — 풀이 글에서는 뺀다 */
function noHanja(t) {
  return String(t || "").replace(/\s*\([\u3400-\u9fff]+\)/g, "");
}
/* 모델이 가끔 하게체 사이에 해라체(~다.)나 틀린 꼴(~을세)을 섞는다 — 문장 끝만 하게체로 고친다 */
const JONG_N = 4;
function dropN(ch) {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171 || c % 28 !== JONG_N) return null;
  return String.fromCharCode(ch.charCodeAt(0) - JONG_N);
}
function hage(t) {
  let s = String(t || "");
  s = s.replace(/(될|할|갈|올|볼|줄|날|일어날)\s*테일세/g, "$1 걸세").replace(/테일세/g, "터일세");
  s = s.replace(/있을세(?=[.!,…]|\s|<|$)/g, "있네").replace(/([었았였했겠])을세(?=[.!,…]|\s|<|$)/g, "$1네");
  s = s.replace(/([가-힣])을세(?=[.!,…]|\s|<|$)/g, "$1을 걸세");
  s = s.replace(/([가-힣])일네(?=[.!,…]|\s|<|$)/g, "$1일세");
  s = s.replace(/([가-힣])(갈|올|될|할|볼|줄)세(?=[.!…]|<|$)/g, "$1$2 걸세");
  /* 문장 끝의 '~다' (따옴표 안은 건드리지 않는다: 바로 뒤가 마침표·느낌표·<br>·끝일 때만) */
  s = s.replace(/([가-힣]{1,8})다(?=\s*(?:[.!]|<br>|<\/strong>|<\/em>|$))/g, (m, w) => {
    if (/(것이|거|게|터)$/.test(w)) return w.replace(/(것이|거|게|터)$/, (x) => (x === "것이" ? "것일세" : x === "터" ? "터일세" : "걸세"));
    if (/는$/.test(w)) return w.slice(0, -1) + "네";
    if (w === "이" || (/[^아]이$/.test(w) && w.length >= 2)) return w.slice(0, -1) + "일세";
    const last = w.slice(-1), d = dropN(last);
    if (d && !/^(않는|있는|없는)$/.test(w)) return w.slice(0, -1) + d + "네";
    return w + "네";
  });
  return s;
}

/* 아주 단순한 주소별 횟수 제한 (한 대에 한정) */
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const win = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 120;   /* 물음 하나에 네 번 부른다 — 휴대폰 공용 주소(통신사)를 생각해 넉넉히 */
}

const SYSTEM = `너는 '백귀술사 호연(狐煙)'이다. 여우의 연기라는 뜻이다. 사람과 귀신의 경계에서 모습을 드러내는 신령한 여우이며, 안개처럼 나타났다 사라지고, 사람의 말 속에 숨은 마음과 보이지 않는 기운을 읽는 여성 술사다. 해동 백귀야행의 백 귀신을 패에 불러내어 질문자의 지금과 앞으로의 흐름을 읽는다.

너는 상담원이 아니다. 관조하고 짚어주는 술사다.

말투
- 상대를 '자네'라 부른다. 하게체만 쓴다. ~하게, ~일세, ~이네, ~하지, ~로군, ~겠지.
- 낮고 단정하게 말한다. '~일 수도 있다', '~인 것 같다', '아마' 같은 흐린 말은 쓰지 않는다.
- 겁을 주되 반드시 길을 같이 준다. 무섭게 말하고 끝내지 않는다.
- 짧게 끊어 친다. 미사여구를 늘어놓지 않는다.
- 할매·무당 말투, 지역 사투리, 고객센터식 존댓말, 반말 명령조(~해라)는 쓰지 않는다.

가장 중요한 것 — 속 시원한 답
A. 각 자리의 첫 문장이 곧 답이다. 그 자리가 손님 물음에 주는 답을 첫 문장에 바로 말한다. 예: "막는 건 자네 자존심일세." "그 사람 속은 아직 자네 쪽일세." "때는 12월 무렵일세." 뜸 들이는 말, 분위기 잡는 말로 시작하지 않는다.
B. 쉬운 말만 쓴다. 중학생이 한 번 읽고 바로 알아들을 말로 쓴다. 오행·목화토금수·갈래·대귀·상생·상극·기운의 이름 같은 술어를 쓰지 않는다. 귀 이름만 그대로 쓴다.
C. 귀의 옛이야기·생김새·출전은 말하지 않는다. 화면에 이미 나와 있다. 귀가 무슨 짓을 하는지는 손님 물음의 일로 바꿔 한 마디만 한다.
D. 물음에서 벗어나지 않는다. 손님이 묻지 않은 분야(연애를 물었는데 돈·문서·송사·몸 이야기 등)로 새지 않는다. 모든 자리가 손님이 물은 바로 그 일에 대한 말이어야 한다.
E. 흐린 말을 쓰지 않는다. '~일 수도', '아마', '~인 것 같다' 금지. 좋으면 좋다, 나쁘면 나쁘다고 못 박는다. 다만 나쁠 때도 할 일 하나는 준다.
F. 짧게. 한 자리에 두세 문장(符는 네 문장까지). 한 문장은 짧게 끊는다.

반드시 지킬 것
1. 각 자리에는 base라는 짧은 뼈대가 주어진다. base에 적힌 귀 이름, 때, 흐름이 좋은지 나쁜지, 처방은 바꾸지 않는다. 그 뼈대를 손님 사정에 맞게 더 또렷하게 다시 쓴다.
2. 손님이 쓴 말(사람·일·때)을 받아서 짚는다. 누구에게나 들어맞는 일반론은 쓰지 않는다.
3. 패에 없는 사실, 새로운 시기, 새로운 단정을 지어내지 않는다.
4. 뒤집혀 나온 패는 그 일이 더 빨리, 더 세게 온다고 한 마디만 한다.
5. 실제 역사 인물이 한 말인 것처럼 꾸며 인용하지 않는다.
6. 상담기관·신고처 안내는 넣지 않는다. 여기는 점을 보는 자리다.
7. 의료·법률 진단을 내리지 않는다. 건강 풀이는 진료를 미루라는 말로 읽히지 않게 쓴다.
8. 돈을 더 내라거나 다른 상품을 권하지 않는다.
9. 앞서 열린 패(opened)는 이미 손님이 읽었다. 같은 말을 되풀이하지 않는다.
10. 자신이나 남의 목숨·몸을 해치는 일을 부추기거나 "되네"로 답하지 않는다.
11. 보고서처럼 쓰지 않는다. 손님 앞에서 패를 뒤집으며 말하는 술사의 입말로 쓴다. 다만 여는 말은 반 문장이면 족하다.
12. 패 번호, 숫자 셈, 항목 나열(·, -)을 쓰지 않는다.
13. 손님이 말하지 않은 사정을 사실처럼 지어내지 않는다. 돈 걱정·병원비·투자·빚·제삼자·다른 사람의 속셈·병 이름, 일정이 밀린다, 의료진을 못 믿는다, 남이 권해서 지원했다 같은 것을 base에 없는데 끌어오지 않는다. 손님의 행동이나 속을 넘겨짚어 '~한 건 아닌가'로 캐묻지도 않는다.
14. 무엇을 하라는 처방은 base에 적힌 것만 쓴다. base에 없는 의식(물 마시기, 동전 놓기, 주문 읊기, 목 돌리기, 햇빛 쬐기 따위)을 새로 지어내지 않는다.
15. 손님을 탓하거나 겁주는 몸 표현(목을 조인다, 짓누른다, 헛것을 본다, 한 맺힌 넋, 피, 죽음)을 쓰지 않는다. 특히 몸·마음·가족의 병을 물을 때는 더 부드럽게 쓴다.
16. 하게체 어미만 쓴다. 문장 끝은 '~네', '~일세', '~게', '~지', '~가', '~세(함께 하자는 뜻)'로 맺는다. '~다.'로 끝나는 해라체(예: 괜찮다, 끝이다, 온다)와 '~을세', '~ㄹ 게다', '~테일세' 같은 틀린 꼴은 쓰지 않는다. 바른 예: 오네, 있네, 끝일세, 괜찮네. '~ㄹ 걸세'는 짐작처럼 들리니 한 자리에 한 번을 넘기지 않는다.
17. 귀 이름 뒤에 한자를 괄호로 붙이지 않는다.

형식
- 결과는 JSON 배열 하나만 내놓는다. 설명이나 머리말, 코드 울타리를 붙이지 않는다.
- 각 원소는 {"pos":"자리한자","text":"풀이"} 꼴이고, 주어진 순서와 개수를 그대로 지킨다.
- text 안에서는 큰따옴표(")를 쓰지 않는다. 말을 따올 때는 '작은따옴표'나 「」를 쓴다. 줄바꿈은 <br>로 쓴다.
- text 안에는 <br>, <em>, <strong> 만 쓸 수 있다. <em>은 귀 이름, <strong>은 못 박는 말(시기·확답·처방)에 쓴다.`;

const TONE = [
  "흐름이 자네 편이다. 담담하게, 그러나 방심하지 말라고 못 박아라.",
  "한 번 꺾였다가 오는 흐름이다. 꺾이는 대목을 분명히 경고하고, 버티는 법을 명하라.",
  "지금 방식으로는 안 된다. 무겁게 경고하되, 바꿔야 할 한 가지를 똑똑히 짚어라.",
  "흐름이 등을 돌렸다. 엄숙하게 판결하듯 짧게 끊되, 끝에는 반드시 살 길 하나를 남겨라.",
];

/* 뼈대도 길이를 자르고, 지시문에 그대로 들어가는 말은 정해진 꼴만 받는다 */
function cleanBone(b, cut) {
  if (!b || typeof b !== "object") return {};
  const word = (v, n) => (/^[가-힣·\s]{1,12}$/.test(String(v ?? "")) ? cut(v, n) : "");
  const list = (v, n, m) => (Array.isArray(v) ? v.slice(0, n).map((x) => cut(x, m)) : []);
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(10, Math.round(+v))) : 0);
  return {
    stage: b.stage === "free" ? "free" : "paid",
    topic: word(b.topic, 6), qtype: word(b.qtype, 4), intent: word(b.intent, 8), worry: cut(b.worry, 30),
    subject: ["반려", "자녀"].includes(b.subject) ? b.subject : "",
    who: cut(b.who, 20), feel: cut(b.feel, 20), whenWord: cut(b.whenWord, 20),
    opened: Array.isArray(b.opened) ? b.opened.slice(0, 10).map((o) => ({ pos: cut(o?.pos, 4), nm: cut(o?.nm, 30) })) : [],
    verdict: cut(b.verdict, 160), why: list(b.why, 6, 120), combos: list(b.combos, 8, 40),
    when: b.when ? { t: cut(b.when.t, 40), d: cut(b.when.d, 80) } : null,
    daegui: num(b.daegui), el: cut(b.el, 4), elN: num(b.elN), grade: num(b.grade), leanN: num(b.leanN),
    leanSuit: cut(b.leanSuit, 12), rev: num(b.rev),
  };
}

function buildPrompt(q, cards, bone, stage) {
  const list = cards
    .map(
      (c, i) =>
        `${i + 1}) 자리 ${c.pos} (${c.posDesc})
   패: ${noHanja(c.nm)} · ${c.rev ? "뒤집힘(더 빨리, 세게 옴)" : "바로 놓임"}
   base(이 자리의 답 — 이 뜻 그대로, 더 쉽고 또렷하게): ${noHanja(c.base || "")}`
    )
    .join("\n");

  const opened = Array.isArray(bone.opened) && bone.opened.length
    ? bone.opened.map((o) => `${o.pos} ${o.nm}`).join(", ")
    : "";

  const asked = [
    bone.intent ? `- 물음의 뜻: ${bone.intent}` : "",
    bone.subject === "반려" ? "- 물음의 대상: 손님이 기르는 반려동물(사람이 아니다). 몸 이야기는 '의원' 대신 '수의사'로 하고, 동물에게 사람의 속셈이나 말버릇을 갖다 붙이지 않는다." : "",
    bone.intent === "반려이별" ? "- 이 물음은 떠나보낸 반려동물을 그리워하는 물음이다. 위로하는 말로 풀고, 돈·문서·다툼·송사 이야기로 끌고 가지 않는다. 손님을 탓하지 않는다." : "",
    bone.intent === "반려입양" ? "- 이 물음은 반려동물을 새로 데려올지 묻는 것이다. 돌볼 채비(시간·형편·함께 사는 사람의 뜻)를 중심으로 푼다." : "",
    bone.subject === "자녀" ? "- 물음의 대상: 손님의 자녀. 아이를 탓하지 말고, 부모가 할 수 있는 일로 풀어 준다." : "",
    bone.worry ? `- 손님이 걱정하는 일: ${bone.worry} (좋은 흐름이면 '그 일은 일어나지 않는다', 나쁜 흐름이면 '그 기미가 있다'로 푼다)` : "",
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
- 앞의 세 장은 이 일의 뿌리(因), 지금 얽힌 것(緣), 자네가 못 보는 것(隱)이다. 이번에 풀 것은 아래 적힌 자리뿐이다.
- 때(시기)와 확답, 붙은 귀, 떼는 법은 덮인 일곱 장에 있으니 절대 말하지 마라.
- 아래에 隱 자리가 있으면, 그 끝을 '그 너머는 덮인 일곱 장이 말해 주네.'처럼 짧고 바른 한 문장으로 맺어라. 돈이나 결제 이야기는 하지 마라.
- 因 자리의 첫 문장은 손님의 물음을 그대로 받아 '자네가 ~하게 된 뿌리는 ~일세' 꼴로 시작하라.
- 물음 속 사람·마음·사정을 직접 집어 말하라. 질문자가 '이 술사가 내 사정을 안다'고 느껴야 한다.

열린 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 정확히 ${cards.length}개의 풀이를 쓴다.
- 각 자리 첫 문장에 그 자리의 답을 바로 말하라(뿌리: 이 일이 어디서 꼬였는지, 지금: 지금 사정이 좋은지 나쁜지, 숨은 것: 손님이 못 보는 것).
- 한 자리당 두세 문장.`;
  }

  return `${head}
- 손님이 이미 읽은 앞의 패: ${opened}

뼈대 (바꾸지 말 것)
- 갈리는 때: ${bone.when.t} (${bone.when.d})
- 확답: ${bone.verdict}
- 열 장 속 조합: ${(bone.combos || []).join(", ") || "없음"} (조합은 화면에서 따로 짚으니 길게 되풀이하지 말고, 해당 자리에서 한 마디만 걸쳐 둔다)

이번 풀이의 결
${TONE[Math.max(0, Math.min(3, Number(bone.grade) || 0))]}

덮여 있던 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 정확히 ${cards.length}개의 풀이를 쓴다.
- 자리 '時'의 풀이에는 "${bone.when.t}"를 그대로 넣는다. 그 밖의 다른 날짜나 달은 지어내지 않는다.
- 자리 '心'에 놓인 귀가 사납더라도, 상대가 그런 사람이라고 단정하지 말고 "그 속에서 이 귀가 하는 짓"으로 푼다.
- 자리 '助'는 base에 적힌 '자네를 받쳐 줄 것'을 또렷하게 말한다. 귀가 사납더라도 그 귀를 설명하느라 말을 쓰지 않는다.
- 자리 '果'는 끝의 모양을 풀되 확답("${bone.verdict}")과 어긋나지 않게 쓴다. 확답 문장은 뒤에서 따로 말하니 그대로 옮겨 적지 않는다.
- 자리 '符'는 base에 적힌 두 처방을 질문자의 사정에 맞춰 오늘 당장 할 수 있는 행동으로 풀어 준다. 처방 자체는 바꾸지 않는다.
- 각 자리 첫 문장에 그 자리의 답을 바로 말하라(막는 것, 돕는 것, 그 사람 속, 때, 붙은 귀와 까닭, 할 일 둘, 끝).
- 질문에 나온 말을 ${cards.length >= 3 ? "최소 세 자리 이상" : "자리마다"}에서 직접 되짚어라.
- 묻는 꼴이 '언제'면 時와 果에서 때를 한 번 더 못 박고, '왜'면 鬼에서 까닭을, '어떻게'면 符에서 방법을, '누구'나 '속'이면 心에서 그 사람의 속을, '어느'면 果에서 고른 쪽을 가장 두껍게 써라.`;
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method === "GET") {
    const r = route(req);
    res.setHeader("cache-control", "no-store");
    res.status(200).json({ ok: !!r });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST만 받는다" });
    return;
  }
  /* 다른 사이트에서 이 통로를 몰래 부르지 못하게 — 같은 주소에서 온 요청만 받는다 */
  const origin = req.headers.origin;
  if (origin) {
    let oh = "";
    try { oh = new URL(origin).host; } catch {}
    if (oh !== req.headers.host && !/^localhost(:\d+)?$/.test(oh)) {
      res.status(403).json({ error: "다른 곳에서 온 요청이다" });
      return;
    }
  }
  if (!route(req)) {
    console.error("reading: no route (OIDC 머리·환경변수 모두 없음)");
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
  if (JSON.stringify(body || {}).length > 24000) {
    res.status(413).json({ error: "너무 길다" });
    return;
  }
  const q = String(body?.q || "").slice(0, MAX_Q).trim();
  /* 들어온 값은 길이를 잘라 쓴다 — 지시문을 부풀려 비용을 키우는 것을 막는다 */
  const cut = (v, n) => String(v ?? "").slice(0, n);
  const cards = (Array.isArray(body?.cards) ? body.cards.slice(0, 10) : []).map((c) => ({
    pos: cut(c?.pos, 4), posDesc: cut(c?.posDesc, 30), rev: !!c?.rev, nm: cut(c?.nm, 30), src: cut(c?.src, 60),
    suit: cut(c?.suit, 12), no: cut(c?.no, 8), el: cut(c?.el, 2), nature: cut(c?.nature, 60), act: cut(c?.act, 160),
    warn: cut(c?.warn, 160), fix: cut(c?.fix, 160), kind: cut(c?.kind, 4), lore: cut(c?.lore, 260), bridge: cut(c?.bridge, 200),
    base: cut(c?.base, 600),
  }));
  const stage = body?.bone?.stage === "free" ? "free" : "paid";
  if (RISK.test(q)) {
    res.status(422).json({ error: "이 물음에는 패를 펴지 않는다" });
    return;
  }
  const bone = cleanBone(body?.bone, cut);
  /* 결제를 붙인 뒤에는 결제 확인 증표가 있어야 유료 풀이를 쓴다(결제 키가 없으면 데모라 그냥 통과) */
  const pc = payConfig();
  if (stage === "paid" && pc.live && !payTokenOk(body?.pay, q, pc.secret)) {
    res.status(402).json({ error: "복비가 확인되지 않았다" });
    return;
  }
  if (!q || !cards.length || (stage === "paid" && (!bone?.when?.t || !bone?.verdict))) {
    res.status(400).json({ error: "패가 모자란다" });
    return;
  }

  try {
    const t0 = Date.now();
    const prompt = buildPrompt(q, cards, bone, stage);
    const maxTok = Math.min(2400, 300 + cards.length * 330);
    /* 모델 글에서 자리별 풀이를 뽑는다 — 배열 뒤에 군말이 붙어도 개수가 맞는 첫 배열을 쓴다 */
    const extract = (raw) => {
      if (!raw) return null;
      const start = raw.indexOf("[");
      if (start < 0 || raw.indexOf("]", start) < 0) return null;
      let got = null;
      for (let end = raw.indexOf("]", start); end >= 0 && !got; end = raw.indexOf("]", end + 1)) {
        const g = parseSections(raw.slice(start, end + 1));
        if (Array.isArray(g) && g.length === cards.length) got = g;
      }
      if (!got) got = parseSections(raw.slice(start, raw.lastIndexOf("]") + 1));
      return Array.isArray(got) && got.length ? got : null;
    };
    let sections = extract(await callModel(req, SYSTEM, prompt, maxTok));
    /* 한 번 어긋나면 한 번만 더 부른다(시간이 남을 때만) */
    if ((!sections || sections.length < cards.length) && Date.now() - t0 < 30000) {
      const again = extract(await callModel(req, SYSTEM, prompt, maxTok));
      if (again && (!sections || again.length > sections.length)) sections = again;
    }
    console.log("reading", stage, sections ? sections.length + "/" + cards.length : "fail", Date.now() - t0 + "ms");
    if (!sections) {
      res.status(502).json({ error: "패를 읽다 끊겼다" });
      return;
    }

    /* 자리 이름으로 다시 맞추고, 빠진 자리는 화면이 준 뼈대 글(base)로 채운다 — 손님에게 오류를 보이지 않는다 */
    const byPos = new Map(sections.map((x) => [String(x?.pos || "").trim(), x]));
    const ordered = cards.map((c, i) => {
      const x = byPos.get(c.pos) || (sections.length === cards.length ? sections[i] : null);
      const t = x && String(x.text || "").trim();
      return { pos: c.pos, text: t || noHanja(c.base || ""), filled: !t };
    });
    if (ordered.every((x) => x.filled)) {
      res.status(502).json({ error: "풀이를 못 알아보겠다" });
      return;
    }
    const clean = ordered.map((s) => ({
      pos: String(s.pos || ""),
      /* 모든 꺾쇠를 막고 속성 없는 <br><em><strong>만 살린다 */
      text: hage(noHanja(String(s.text || "")))
        .replace(/<(?!\/?(br|em|strong)\s*\/?>)\/?[a-z!][^<>]*>/gi, "")
        .replace(/<(?!\/?(br|em|strong)\s*\/?>)/gi, "〈")
        .replace(/>/g, (m, i, str) => (/<\/?(br|em|strong)\s*\/?$/i.test(str.slice(Math.max(0, i - 9), i)) ? ">" : "〉"))
        .replace(/<(\/?)(br|em|strong)\s*\/?>/gi, (m, c, t) => (t.toLowerCase() === "br" ? "<br>" : `<${c}${t.toLowerCase()}>`)),
    }));

    res.setHeader("cache-control", "no-store");
    res.status(200).json({ sections: clean });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "패를 읽다 끊겼다" });
  }
}
