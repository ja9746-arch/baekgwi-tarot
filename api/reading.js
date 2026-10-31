/* 백귀타로 — 풀이 생성
 *
 * 뼈대(시기·확답·붙은 귀·오행 쏠림)는 화면 쪽 코드가 계산해 넘긴다.
 * 여기서는 그 뼈대를 바꾸지 않고, 질문에 맞춰 살만 붙인다.
 * 결제가 끝난 뒤에만 불린다.
 */

/* 백귀사주와 같은 통로를 쓴다. 베르셀 안에서는 열쇠 없이도 붙는다. */
import { payConfig, payTokenOk } from "./pay.js";

/* 먼저 깊게 읽는 모델로 쓰고, 막히거나 늦으면 빠른 모델로 넘어간다(쉼표로 순서를 바꿀 수 있다) */
const MODELS = String(process.env.BAEKGWI_MODEL || "anthropic/claude-sonnet-4.5,anthropic/claude-haiku-4.5").split(",").map((x) => x.trim()).filter(Boolean);
const FAST = MODELS[MODELS.length - 1];
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

async function callModel(req, system, prompt, maxTok = 3200, opt = {}) {
  const list = opt.models || MODELS;
  const end = Date.now() + (opt.budget || 38000);
  for (let i = 0; i < list.length; i++) {
    const left = end - Date.now();
    if (left < 4000) break;
    const last = i === list.length - 1;
    const ms = last ? left : Math.min(left - 9000, 27000);
    if (ms < 4000) continue;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const out = await callOne(req, system, prompt, maxTok, list[i], ctl.signal);
      if (out) { if (i > 0) console.log("model fallback", list[i]); return out; }
    } catch (e) {
      console.error("model", list[i], String(e && e.name === "AbortError" ? "timeout" : e).slice(0, 120));
    } finally { clearTimeout(timer); }
  }
  return null;
}
async function callOne(req, system, prompt, maxTok, MODEL, signal) {
  const r = route(req);
  if (!r) return null;

  if (r.how === "gateway") {
    const res = await fetch(GATEWAY, {
      method: "POST",
      signal,
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
    signal,
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
function jong(c) { const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k < 11172 ? k % 28 : 0; }
/* 확답 첫마디로 쓸 수 없는 흐리는 말 */
const VAGUE_HEAD = /다만|뿐|수도\s*있|달라질\s*수|바뀔\s*수|될\s*수도|할\s*수도|있을\s*수도|어려울\s*수|쉽지\s*않을\s*수|알\s*수\s*없|모르겠|아직\s*모르|반반|절반|두고\s*봐야|봐야\s*알|가\s*봐야|지켜봐야|지켜\s*봐야|애매|기울어\s*있|나름|달렸네|달려\s*있|하기에\s*따라|에\s*따라\s*다르|경우에\s*따라|상황에\s*따라|사람에\s*따라|어쩌면|아마|글쎄|섣불리|장담|확실하지|단정하기|하기\s*어렵네|듯하네|듯싶네|일지도|ㄹ지도|할지도|될지도|그럴지도|어느\s*쪽(도|이든|인지)|같기도|반은/;
/* 풀이 어디에 있어도 안 되는 말 */
const VAGUE_ANY = /알\s*수\s*없네|두고\s*봐야\s*아네|반반일세|장담(은|할)\s*못|점(은|으로)\s*알\s*수/;
/* 손님이 겪은 일을 손님 탓으로 돌리는 말 — 확답에 들어오면 버린다 */
const BLAME = /(자네|그대)\s*(안의|속의|마음(이|의))[^.!?]{0,20}(때문|탓|불러|쌓|만들|지어)|자네가\s*(불러들|자초|만든\s*일|키운\s*일)|(자네|그대)\s*탓(일세|이네|이라)/;
/* 뼈대가 '지금 하라'는데 확답이 '미뤄라'로 돌아서면 버린다(그 반대도) */
const DO_NOW = /(거절|거부|신고|고소|진정|지급\s*정지|멈추|끊)[가-힣]*게|오늘\s*(바로|안에)|지금\s*바로|미루지\s*말게|이번\s*주\s*안에/;
const HOLD_OFF = /기다리게|묵히게|묵혀\s*두게|입\s*(을)?\s*다물|지켜만\s*보게|미루게|서두르지\s*말고\s*기다|가만히\s*있게|한\s*철만\s*두고\s*보게|아무\s*말도\s*말게|때가\s*(오|되)면|때를\s*기다|나중에\s*말하게|천천히\s*해도\s*되네/;
/* 뼈대에 없는 '몇 가지·며칠' 같은 셈을 지어내면 버린다 */
const COUNTS = /(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|사흘|이레|열흘|보름|며칠)\s*(가지|번|줄|개|달|주|가지를|장)/g;
function madeUpCount(a, base) {
  const inA = String(a).match(COUNTS) || [];
  return inA.some((m) => !String(base).includes(m.replace(/\s+/g, "")) && !String(base).includes(m));
}
function hage(t) {
  let s = String(t || "");
  s = s.replace(/(될|할|갈|올|볼|줄|날|일어날)\s*테일세/g, "$1 걸세").replace(/테일세/g, "터일세");
  s = s.replace(/있을세(?=[.!,…]|\s|<|$)/g, "있네").replace(/([었았였했겠])을세(?=[.!,…]|\s|<|$)/g, "$1네");
  s = s.replace(/([가-힣])을세(?=[.!,…]|\s|<|$)/g, "$1을 걸세");
  s = s.replace(/([가-힣])일네(?=[.!,…]|\s|<|$)/g, "$1일세");
  /* 반말 끝맺음 */
  const END = "(?=[.!…]|\\s*<|\\s*$)";
  s = s.replace(new RegExp("(거|게)야" + END, "g"), "걸세").replace(new RegExp("말이야" + END, "g"), "말일세");
  s = s.replace(new RegExp("([가-힣])다고" + END, "g"), "$1다네").replace(/([가-힣])이일세/g, (m, c) => (jong(c) ? c + "일세" : m));
  s = s.replace(new RegExp("([가-힣])이야" + END, "g"), (m, c) => c + (jong(c) ? "일세" : "이일세"));
  s = s.replace(new RegExp("([겠했었았였])어" + END, "g"), "$1네").replace(/자네게(?=\s)/g, "자네에게").replace(/당신/g, "자네").replace(/(지금|이제|먼저|다시|자네|그) \1(?=\s)/g, "$1").replace(/(\s)거일세/g, "$1걸세").replace(/([가-힣])네네(?=[.!…\s<]|$)/g, "$1네").replace(/겁이 있네/g, "겁이 나네").replace(/([가-힣])야 네(?=[.!…\s<]|$)/g, "$1야 하네").replace(/않을 일세/g, "않을 걸세").replace(/얽인/g, "얽힌").replace(/아니야(?=[.!…\s<]|$)/g, "아닐세").replace(/체크(하|해)/g, "확인$1").replace(/체크/g, "확인").replace(/타이밍/g, "때").replace(/패턴/g, "버릇").replace(/(끝까지|자꾸만|자꾸|조금씩|천천히|정말|너무) \1(?=\s)/g, "$1").replace(/아니일세/g, "아닐세").replace(/귀담아 들게/g, "귀담아듣게").replace(/천천할 수/g, "천천히 할 수");
  /* 겁주는 몸 표현 */
  s = s.replace(/목을 조이/g, "발목을 잡").replace(/목을 조여/g, "발목을 잡아");
  s = s.replace(/([가-힣])(갈|올|될|할|볼|줄)세(?=[.!…]|<|$)/g, "$1$2 걸세");
  s = s.replace(/([가-힣])세(?=[.!…]|<|$)/g, (m, c) => (jong(c) === 8 && !/[일걸닐럴널]/.test(c) ? c + " 걸세" : m));
  /* 문장 끝의 '~다' (따옴표 안은 건드리지 않는다: 바로 뒤가 마침표·느낌표·<br>·끝일 때만) */
  s = s.replace(/([가-힣]{1,8})다(?=\s*(?:[.!]|<br>|<\/strong>|<\/em>|$))/g, (m, w) => {
    if (/(것이|거|게|터)$/.test(w)) return w.replace(/(것이|거|게|터)$/, (x) => (x === "것이" ? "것일세" : x === "터" ? "터일세" : "걸세"));
    if (/는$/.test(w)) return w.slice(0, -1) + "네";
    if (w === "이" || (/[^아]이$/.test(w) && w.length >= 2)) return w.slice(0, -1) + "일세";
    const last = w.slice(-1), d = dropN(last);
    if (d && !/^(않는|있는|없는)$/.test(w)) return w.slice(0, -1) + d + "네";
    return w + "네";
  });
  /* 마침표 뒤 띄어쓰기가 빠지면 넣는다 */
  s = s.replace(/([.!?])(?=[가-힣‘“'])/g, "$1 ");
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
- 상대를 '자네'라 부른다('당신'이라 부르지 않는다). 손님 본인에게는 높임말(-시-)을 쓰지 않는다. 하게체만 쓴다. ~하게, ~일세, ~이네, ~하지, ~로군, ~겠지.
- 낮고 단정하게 말한다. '~일 수도 있다', '~인 것 같다', '아마' 같은 흐린 말은 쓰지 않는다.
- 긴장감은 주되 반드시 길을 같이 준다. 무섭게 말하고 끝내지 않는다. 아이·몸·가족의 병·반려동물 물음에서는 '무섭다', '칼', '깨진다' 같은 겁주는 말을 쓰지 않는다.
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
1. 각 자리에는 base라는 짧은 뼈대가 주어진다. base에서 지킬 것은 귀 이름, 때, 흐름이 좋은지 나쁜지, 처방의 뜻이다. base 속 사정(기록, 평판, 계약서, 친구 하나 같은 것)이 손님 물음과 맞지 않으면 버리고, 그 자리의 결만 가져와 손님이 적은 사정으로 다시 쓴다. base 문장을 그대로 베끼지 않는다.
2. 손님이 쓴 말(사람·일·때)을 받아서 짚는다. 누구에게나 들어맞는 일반론은 쓰지 않는다.
3. 패에 없는 사실, 새로운 시기, 새로운 단정을 지어내지 않는다.
4. 뒤집혀 나온 패는 base에 그 말이 있을 때만 한 번 짚는다. base에 없는 '거꾸로 나왔으니', '더 세게', '더 빨리 닥친다' 같은 말을 보태지 않는다. 몸·아이·반려·지친 마음을 묻는 물음에서는 뒤집힘을 말하지 않는다.
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
16. 하게체 어미만 쓴다. 문장 끝은 '~네', '~일세', '~게', '~지', '~가', '~세(함께 하자는 뜻)'로 맺는다. '~다.'로 끝나는 해라체(예: 괜찮다, 끝이다, 온다)와 '~을세', '~ㄹ 게다', '~테일세' 같은 틀린 꼴은 쓰지 않는다. 바른 예: 오네, 있네, 끝일세, 괜찮네. '~ㄹ 걸세'는 짐작처럼 들리니 한 자리에 한 번을 넘기지 않는다. '~야', '~거야', '~한다고', '~말이야' 같은 반말 끝맺음도 쓰지 않는다.
17. 귀 이름 뒤에 한자를 괄호로 붙이지 않는다.
18. 손님이 남에게 당했거나(돈을 떼임, 공을 빼앗김, 보증금을 못 받음) 병·나이 때문에 생긴 일이면, 뿌리(因)를 손님의 잘못이나 성격 탓으로 돌리지 않는다.
19. 손님이 말하지 않은 사람(누군가, 사람 하나, 집안 어른, 주변 사람)을 새로 등장시키지 않는다. base에 그런 사람이 나와도 손님이 물음에 쓴 사람이나 손님 자신이 가진 것(기록, 경험, 시간)으로 바꿔 쓴다.
20. 한 풀이 안에서 결정의 방향이 흔들리지 않게 한다. 확답(또는 흐름의 결)과 반대되는 조언을 어느 자리에서도 하지 않는다.
21. 손님의 물음 문장을 그대로 다시 읊지 않는다. 손님이 쓴 말은 숫자·사람·사건 같은 조각만 짚는다.
23. 손님이 말한 사실을 '~가 아니라'로 부정하지 않는다. 손님이 '아이디어를 빼앗겼다', '일이 힘들다', '출근이 무섭다'고 했으면 그 말을 사실로 받는다.
24. 손님의 행동을 넘겨짚어 사실처럼 말하지 않는다('기록을 안 남겼다', '예전 일을 꺼낸다', '말을 옮겼다' 등). 모르는 것은 '~라면'으로 쓰거나 쓰지 않는다.
25. 자리의 뜻을 뒤집지 않는다. 助 자리의 귀는 자네를 돕고, 敵 자리의 귀는 막고, 鬼 자리의 귀만 자네에게 붙은 귀다. 다른 자리의 귀 이름을 끌어오지 않는다.
26. 때는 base에 적힌 때 말만 그대로 쓰고, '몇 달 남았다'처럼 셈하지 않는다. 처방(符)의 때는 확답과 어긋나지 않게 쓴다. 확답이 '미루라'면 '이번 주에 하라'고 하지 않는다.
27. 因과 果에서는 손님이 적은 숫자·기간·사건 가운데 하나 이상을 손님 말 그대로 짚는다(예: 일흔넷 연세, 3년, 500만원).
28. 영어 외래어(체크, 타이밍, 패턴 등)를 쓰지 않는다. 같은 말을 잇달아 두 번 쓰지 않는다.
22. 늙은 반려동물이나 오래가는 병(신장 수치 등)은 '다시 살아난다', '곧 낫는다'고 하지 않고, 떠남을 넌지시 비치지도 않는다. 수의사가 일러 준 대로 편한 날을 늘리는 쪽으로 푼다. 아이를 기다리는 물음엔 몸이나 마음을 탓하지 않고, 임신 시기를 못 박지 않는다.

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
    lean: ["good", "bad"].includes(b.lean) ? b.lean : "", tired: b.tired ? 1 : 0,
    loose: b.loose ? 1 : 0, thin: b.thin ? 1 : 0,
    facts: Array.isArray(b.facts) ? b.facts.slice(0, 6).map((x) => cut(x, 60)).filter(Boolean) : [], act: cut(b.act, 40),
    opened: Array.isArray(b.opened) ? b.opened.slice(0, 10).map((o) => ({ pos: cut(o?.pos, 4), nm: cut(o?.nm, 30) })) : [],
    verdict: cut(b.verdict, 160), why: list(b.why, 6, 120), combos: list(b.combos, 8, 40),
    when: b.when ? { t: cut(b.when.t, 40), d: cut(b.when.d, 80) } : null,
    daegui: num(b.daegui), el: cut(b.el, 4), elN: num(b.elN), grade: num(b.grade), leanN: num(b.leanN),
    leanSuit: cut(b.leanSuit, 12), rev: num(b.rev), noWhen: b.noWhen ? 1 : 0, lean10: num(b.lean10),
  };
}

function buildPrompt(q, cards, bone, stage) {
  const list = cards
    .map(
      (c, i) =>
        `${i + 1}) 자리 ${c.pos} (${c.posDesc})
   패: ${noHanja(c.nm)} · ${c.rev ? "뒤집힘(base에 그 말이 있을 때만 짚는다)" : "바로 놓임"}
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
    bone.intent === "마음건강" ? "- 이 물음은 마음이 지친 사람의 물음이다. 손님을 탓하지 않고, 혼자 버티지 말라는 말과 필요하면 진료를 받아 보라는 말을 부드럽게 넣는다. 겁주는 귀 묘사는 쓰지 않는다." : "",
    bone.intent === "면접" ? "- 이 물음은 면접이다. 시험 공부나 문제 풀이 이야기가 아니라 면접관, 답변, 태도, 경험 이야기로 푼다." : "",
    bone.intent === "소개팅" ? "- 이 물음은 아직 만나지 않았거나 막 만난 사람과의 자리다. 둘 사이의 지난 일이나 오래된 정을 지어내지 않는다." : "",
    bone.intent === "잠수" ? "- 이 물음은 연락이 끊긴 사람에 대한 것이다. 상대를 나쁜 사람으로 단정하지 않는다." : "",
    bone.intent === "반대" ? "- 이 물음은 부모님이 손님의 연애·혼인을 반대하는 일이다. '그 사람'은 손님이 만나는 사람이고, 부모님은 따로 '부모님'으로 부른다. 부모님을 나쁘게 말하지 않는다." : "",
    bone.intent === "떠난인연" ? "- 이 물음은 헤어진 사람이 다른 사람과 결혼하거나 새 연애를 한다는 소식에 아파하는 것이다. 다시 이어진다는 말, 그 사람이 아직 자네를 생각한다는 말은 하지 않는다. 아픔이 가라앉는 길과 자네 일상을 지키는 쪽으로 푼다." : "",
    bone.intent === "괴롭힘" ? "- 이 물음은 직장에서 괴롭힘(폭언·갑질 등)을 당하는 손님의 물음이다. 손님을 탓하거나 참으라고 하지 않는다. 기록을 남기고 알리는 쪽, 손님 몸과 마음을 먼저 지키는 쪽으로 푼다." : "",
    bone.intent === "다단계" ? "- 이 물음은 다단계나 고수익 투자 권유다. 어떤 패가 나와도 하라고 권하지 않는다. 돈을 넣지 말고 사람과의 정은 따로 지키라는 쪽으로 푼다." : "",
    bone.intent === "동업갈등" ? "- 이 물음은 동업자가 돈을 빼돌린 것 같다는 의심이다. 손님을 탓하지 않고, 장부·기록을 모으고 전문가와 상의하는 쪽으로 푼다. 없는 사실을 단정하지 않는다." : "",
    bone.intent === "부모이혼" ? "- 이 물음은 부모님의 이혼을 앞둔 자녀의 물음이다. 어느 편을 들라고 하지 않고, 손님 자신의 마음과 일상을 지키는 쪽으로 푼다." : "",
    bone.intent === "기다림" ? "- 이 물음은 군대·유학·장거리처럼 떨어져 지내는 연인을 기다릴 수 있을지 묻는 것이다. 바람이나 이별을 넘겨짚지 않는다." : "",
    bone.intent === "배신" ? "- 이 물음은 믿는 사람이 등을 돌릴지 걱정하는 것이다. 화해·다툼 이야기로 바꾸지 말고, 믿어도 될지와 무엇을 조심할지로 푼다." : "",
    /(엄마|아빠|어머니|아버지|부모님|할머니|할아버지|시어머니|시아버지|시부모님|장모|장인)/.test(bone.who || "") ? "- 물음 속 사람은 손님의 어른이다. 그분을 가리키는 문장은 높임말(-시-)로 쓴다. 예: '어머님도 풀고 싶어 하시네'." : "",
    /검진|검사/.test(q) && !/수술|시술/.test(q) ? "- 이 물음은 검사 결과를 묻는 것이다. 이미 아프다고 전제하지 않는다." : "",
    bone.intent === "임신" ? "- 이 물음은 아이를 기다리는 부부의 물음이다. 몸이나 마음 탓, '조급해서 막혔다'는 말을 하지 않는다. 누가 아이를 품는지 단정하지 않고('자네 몸' 대신 '두 사람'), 임신 시기를 못 박지 않는다. 果에서 '막혔다'고 하지 않는다." : "",
    bone.subject === "자녀" ? "- 물음의 대상: 손님의 자녀. 아이를 탓하지 말고, 부모가 할 수 있는 일로 풀어 준다." : "",
    bone.worry ? `- 손님이 걱정하는 일: ${bone.worry} (좋은 흐름이면 '그 일은 일어나지 않는다', 나쁜 흐름이면 '그 기미가 있다'로 푼다)` : "",
    bone.facts && bone.facts.length > 1 ? `- 손님이 적은 사정 조각: ${bone.facts.map((f, i) => "①②③④⑤⑥"[i] + " " + f).join("  ")}\n  · 숫자·기간·사람·사건은 손님이 쓴 말 그대로 받아 짚는다(예: '3년', '500만원', '팀장'). 자리마다 서로 다른 조각을 짚고, 같은 조각을 두 자리에서 되풀이하지 않는다.\n  · 손님이 쓰지 않은 사정(집안 반대, 돈 문제, 다른 사람 등)은 보태지 않는다.` : "",
    bone.act ? `- 손님이 할지 말지 묻는 일: '${bone.act}'. 확답이 바로 이 일에 대한 답이니, 자리마다 이 결정에 닿게 푼다(이 일을 할 때 무엇이 막고 무엇이 돕는지).` : "",
    bone.lean ? `- 이번 판의 결(손님에게는 말하지 말 것): ${bone.lean === "good" ? "좋은 쪽" : "막힌 쪽"}. 앞의 세 장도 이 결과 어긋나는 조언을 하지 않는다.` : "",
    bone.tired ? "- 손님은 많이 지쳐 있다. 쉼과 마음 진료를 먼저 권하고, 그 두려움을 다른 사람 탓으로 지어내지 않는다. 회사 안의 평판·윗선·기록·공 같은 이야기로 끌고 가지 않는다. 일을 더 하라는 처방을 하지 않는다." : "",
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
${bone.noWhen ? "- 때: 이 물음은 날을 받을 일이 아니다. 날짜·달·계절을 말하지 않는다.\n" : `- 때: ${bone.when.t}\n`}- 확답: ${bone.verdict}
- 열 장 속 조합: ${(bone.combos || []).join(", ") || "없음"} (조합은 화면에서 따로 짚으니 길게 되풀이하지 말고, 해당 자리에서 한 마디만 걸쳐 둔다)

이번 풀이의 결
${TONE[Math.max(0, Math.min(3, Number(bone.grade) || 0))]}

덮여 있던 패 (이 순서대로 풀어라)
${list}

지시
- 위 패 순서대로 정확히 ${cards.length}개의 풀이를 쓴다.
${bone.noWhen ? "- 자리 '時'에서는 날짜·달·계절을 말하지 않는다. 이 물음은 날을 받을 일이 아니니, base처럼 자네가 움직일 때(이번 주 안, 이번 달)만 말한다." : `- 자리 '時'의 풀이에는 "${bone.when.t}"를 그대로 넣고, 그때 무슨 일이 일어나는지를 한 문장으로 못 박는다. 그 밖의 다른 날짜나 달은 지어내지 않는다.`}
- 애매하게 흐리지 않는다. '다만 ~뿐', '~일 수도 있네', '달라질 수 있네', '알 수 없네', '반반', '두고 봐야', '지켜봐야', '자네 하기 나름', '~에 달렸네', '경우에 따라', '어쩌면', '아마', '글쎄' 같은 말은 쓰지 않는다. 각 자리 첫 문장은 그 자리의 답을 단정해서 말한다.
- 자리 '心'에 놓인 귀가 사납더라도, 상대가 그런 사람이라고 단정하지 말고 "그 속에서 이 귀가 하는 짓"으로 푼다.
- 자리 '助'는 base에 적힌 '자네를 받쳐 줄 것'을 또렷하게 말한다. 귀가 사납더라도 그 귀를 설명하느라 말을 쓰지 않는다.
- 자리 '果'는 끝의 모양을 풀되 확답("${bone.verdict}")과 어긋나지 않게 쓴다. 확답 문장은 뒤에서 따로 말하니 그대로 옮겨 적지 않는다.
- 자리 '符'는 base에 적힌 두 처방을 질문자의 사정에 맞춰 오늘 당장 할 수 있는 행동으로 풀어 준다. 처방 자체는 바꾸지 않는다.
- 각 자리 첫 문장에 그 자리의 답을 바로 말하라(막는 것, 돕는 것, 그 사람 속, 때, 붙은 귀와 까닭, 할 일 둘, 끝).
- 질문에 나온 말을 ${cards.length >= 3 ? "최소 세 자리 이상" : "자리마다"}에서 직접 되짚어라.
${cards.some((c) => c.pos === "果") ? `- 배열 맨 끝에 {"pos":"答","text":"..."} 하나를 더 붙인다(그래서 원소는 ${cards.length + 1}개다). 이것은 손님 물음에 내리는 확답이다.
  · 두세 문장, 30자에서 90자 사이. 첫 문장은 15자 안팎의 단정 한마디다(예: '좋아하네.', '붙네.', '하지 말게.', '틀어지지 않네.'). 둘째 문장에서 물음에 나온 사람이나 일을 그대로 넣어 까닭이나 걸림돌을 구체적으로 짚고, 마지막에 무엇을 하면 되는지 하나를 못 박는다.
  · 첫마디에 흐리는 말을 쓰면 그 풀이는 버린다. 이런 말은 절대 쓰지 않는다 — '다만 ~뿐', '~일 수도 있네', '달라질 수 있네', '바뀔 수 있네', '어려울 수 있네', '알 수 없네', '아직 모르네', '반반', '절반', '두고 봐야', '지켜봐야', '가 봐야 아네', '자네 하기 나름일세', '~에 달렸네', '경우에 따라', '어쩌면', '아마', '글쎄', '장담은 못 하네', '단정하기 어렵네', '~일지도 모르네', '어느 쪽도', '~인 듯하네'.
  · 첫마디는 '예' 아니면 '아니오'가 바로 읽히는 한마디여야 한다. 읽는 사람이 다시 물어야 한다면 틀린 첫마디일세.
  · 뼈대의 확답 "${bone.verdict}"와 같은 쪽을 말한다. 좋다·나쁘다, 하라·말라의 결을 절대 뒤집지 않는다. 뼈대 확답에 든 조심시키는 말(진료·상담·신고·수의사·법률·글로 남기기·멈추라는 말 같은 것)은 빼지 않는다.
${bone.loose ? `  · 뼈대의 확답 "${bone.verdict}"는 갈래를 가리지 못해 내놓은 두루뭉술한 바닥 문장이다. 그 문장에 매이지 말고, 손님이 적은 그 일에 맞춰 答을 새로 지어라. 다만 좋고 나쁨의 결은 반드시 지킨다 — 지금 판은 ${(bone.grade ?? 0) <= 1 ? "열리는 쪽이니 되네·하게 쪽으로" : "막힌 쪽이니 어렵네·말게 쪽으로"} 말한다.
` : ""}${bone.thin ? `  · 손님이 사정을 거의 적지 않았다. 없는 사정을 지어내 단정하지 말고, 패가 가리키는 흐름만 말한 뒤 무엇을 묻는지 한 줄 더 적어 달라고 청한다. 사람을 끊으라거나 인연이 끝났다는 식의 모진 말은 하지 않는다.
` : ""}${bone.loose ? "" : `  · 答은 뼈대의 확답 "${bone.verdict}"가 가리키는 그 일만 말한다.`} 符나 다른 자리에 적은 처방·행동을 答으로 옮겨 적지 않는다. 뼈대 확답에 없는 새 지시(글로 남겨라, 사흘 입을 다물어라, 세 가지를 적어라 같은 것)를 지어내지 않는다.
  · 손님이 겪은 일을 손님 탓으로 돌리지 않는다. '자네 안의 망설임 때문일세', '자네 마음이 불러온 일일세', '자네 탓일세' 같은 말은 쓰지 않는다. 남이 한 짓은 남이 한 짓으로 말한다.
  · 손님이 적지 않은 사정을 지어내지 않는다. 두 곳 가운데 고르는 물음에 '지금 다니는 곳'을 끌어오거나, 집안일 물음에 없는 다툼을 넣지 않는다.
  · 날짜나 달 이름은 넣지 않는다(때는 따로 말한다). 패나 귀 이름도 넣지 않는다.
  · 손님을 '자네'로 부르고 '~네', '~게', '~일세'로 맺는다.
` : ""}- 묻는 꼴이 '언제'면 時와 果에서 때를 한 번 더 못 박고, '왜'면 鬼에서 까닭을, '어떻게'면 符에서 방법을, '누구'나 '속'이면 心에서 그 사람의 속을, '어느'면 果에서 고른 쪽을 가장 두껍게 써라.`;
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
  /* ── 갈래만 가려 달라는 물음 — 패를 뽑는 동안 미리 묻는다 ── */
  if (body?.mode === "intent") {
    if (RISK.test(q) || q.length < 2) {
      res.setHeader("cache-control", "no-store");
      res.status(200).json({ intent: "" });
      return;
    }
    /* 갈래는 이름만으로는 뜻이 안 통한다 — 화면 쪽이 한 줄 힌트를 함께 보낸다 */
    const raw = Array.isArray(body?.keys) ? body.keys.slice(0, 200) : [];
    const list = raw
      .map((e) => (typeof e === "string" ? { k: cut(e, 12), h: "" } : { k: cut(e?.k, 12), h: cut(e?.h, 70) }))
      .filter((e) => /^[가-힣]{1,12}$/.test(e.k));
    const keys = list.map((e) => e.k);
    if (!keys.length) {
      res.setHeader("cache-control", "no-store");
      res.status(200).json({ intent: "" });
      return;
    }
    const sys = "너는 한국어 물음을 미리 정해진 갈래 하나로 가르는 일만 한다. 설명하지 않고 갈래 이름 하나만 답한다.";
    const pr =
      "갈래 목록 (이름 — 어떤 물음을 받는 갈래인지):\n" +
      list.map((e) => (e.h ? `${e.k} — ${e.h}` : e.k)).join("\n") +
      `\n\n물음:\n"${q}"\n\n` +
      "이 물음이 무엇에 대한 것인지 위 목록에서 가장 알맞은 갈래 하나를 고른다.\n" +
      "- 설명이 이 물음과 딱 맞아떨어지는 갈래만 고른다. 이름만 비슷하고 설명이 어긋나면 고르지 않는다.\n" +
      "- 조금이라도 망설여지면 '없음'이라고 답한다. 틀린 갈래를 고르는 것이 '없음'보다 훨씬 나쁘다.\n" +
      "- 물음이 짧거나 사정이 적혀 있지 않아 무엇을 묻는지 알 수 없으면 '없음'이라고 답한다.\n" +
      "- 물음에 곁들인 사정이 아니라, 손님이 실제로 묻고 있는 그 일을 고른다.\n" +
      "- 갈래 이름을 그대로, 글자 하나 바꾸지 말고 적는다. 다른 말은 적지 않는다.";
    let pick = "";
    try {
      const out = await callModel(req, sys, pr, 24, { models: [FAST], budget: 12000 });
      pick = String(out || "").replace(/[^가-힣]/g, "").trim();
    } catch {}
    if (pick === "없음" || !keys.includes(pick)) pick = "";
    /* 규칙이 못 잡은 물음만 셈해 둔다 — 물음 글은 남기지 않는다 */
    if (body?.miss) console.log("intent-miss", pick || "(없음)");
    res.setHeader("cache-control", "no-store");
    res.status(200).json({ intent: pick });
    return;
  }

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
    const wantAns = stage === "paid" && cards.some((c) => c.pos === "果");
    const extract = (raw) => {
      if (!raw) return null;
      const start = raw.indexOf("[");
      if (start < 0 || raw.indexOf("]", start) < 0) return null;
      let got = null;
      for (let end = raw.indexOf("]", start); end >= 0 && !got; end = raw.indexOf("]", end + 1)) {
        const g = parseSections(raw.slice(start, end + 1));
        if (Array.isArray(g) && (g.length === cards.length || (wantAns && g.length === cards.length + 1))) got = g;
      }
      if (!got) got = parseSections(raw.slice(start, raw.lastIndexOf("]") + 1));
      return Array.isArray(got) && got.length ? got : null;
    };
    let sections = extract(await callModel(req, SYSTEM, prompt, maxTok));
    /* 한 번 어긋나면 한 번만 더 부른다(시간이 남을 때만) */
    if ((!sections || sections.length < cards.length) && Date.now() - t0 < 30000) {
      const again = extract(await callModel(req, SYSTEM, prompt, maxTok, { models: [FAST], budget: Math.max(6000, 40000 - (Date.now() - t0)) }));
      if (again && (!sections || again.length > sections.length)) sections = again;
    }
    console.log("reading", stage, sections ? sections.length + "/" + cards.length : "fail", Date.now() - t0 + "ms");
    if (!sections) {
      res.status(502).json({ error: "패를 읽다 끊겼다" });
      return;
    }

    /* 자리 이름으로 다시 맞추고, 빠진 자리는 화면이 준 뼈대 글(base)로 채운다 — 손님에게 오류를 보이지 않는다 */
    const ansRaw = wantAns ? sections.find((x) => String(x?.pos || "").trim() === "答") : null;
    sections = sections.filter((x) => String(x?.pos || "").trim() !== "答");
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
    /* 지켜지지 않은 규칙의 문장은 빼낸다 — 넘겨짚는 물음, 겁주는 그림, 아픈 물음에서 손님 탓·뒤집힘 말 */
    const SENS = ["반려", "자녀", "가족건강", "마음건강"].includes(bone.subject) || ["임신", "가족건강", "반려", "반려이별", "마음건강", "자녀"].includes(bone.intent) || bone.tired || ["건강", "아이"].includes(bone.topic);
    const GUESS = /(않았나|않은가|아닌가|않았는가|않나|잖은가|아니었나)\s*[.?!]?$/;
    const SCARE = /목을\s*(졸|조)|헤집|밀어냈|뚝\s*끊|피를\s*|죽음|떨어질지|목숨/;
    const BLAME = /자네[^.]{0,36}(번지|번진|옮기|옮겨|옮긴|전해지|전해진|전해졌|더디게\s*하|밀어\s*넣|탓일세|탓이네|때문일세)/;
    const REV = /거꾸로|뒤집혀/;
    const FAST = /더\s*빨리,?\s*(더\s*)?세게|빨리,?\s*세게/;
    const scrub = (pos, t) => {
      const parts = String(t).split(/(<br>)/);
      let kept = 0, total = 0;
      const out = parts.map((seg) => {
        if (seg === "<br>") return seg;
        const ss = seg.split(/(?<=[.!?…])\s+/);
        return ss.filter((x, k) => {
          if (!x.trim()) return true;
          total++;
          const bad = GUESS.test(x.trim()) || SCARE.test(x) || FAST.test(x) || (SENS && (BLAME.test(x) || REV.test(x)));
          if (bad && !(k === 0 && seg === parts[0] && ss.length === 1)) return false;
          kept++; return true;
        }).join(" ");
      }).join("").replace(/(<br>)\s*(<br>)+/g, "<br>").replace(/^(\s*<br>)+|(<br>\s*)+$/g, "").trim();
      return kept ? out : t;
    };
    clean.forEach((s) => {
      s.text = scrub(s.pos, s.text);
      if (s.pos !== "鬼") s.text = s.text.replace(/(붙어\s*있네|붙었네)/g, s.pos === "心" ? "비치네" : "앉았네");
      s.text = s.text.replace(/타이트/g, "빠듯").replace(/리듬/g, "흐름").replace(/시댉/g, "시댁");
    });
    /* '그 너머는 덮인 일곱 장이…'는 무료의 마지막 자리(隱)에만 붙는다 */
    clean.forEach((s) => { if (s.pos !== "隱") s.text = s.text.replace(/\s*(<br>)?\s*그 너머는 덮인 일곱 장이[^.<]*[.]?/g, "").trim(); });

    /* 확답 다듬기 — 뼈대와 결이 같고, 조심시키는 말을 지켰을 때만 쓴다(아니면 화면의 확답을 그대로 둔다) */
    let answer = "";
    if (ansRaw) {
      let a = hage(noHanja(String(ansRaw.text || "").replace(/<br\s*\/?>/gi, " "))).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      a = scrub("答", a);
      const base = String(bone.verdict || "");
      const KEEP = ["진료", "상담", "신고", "수의사", "변호사", "법률", "노무", "노동청", "지급정지", "임차권등기", "의료진", "멈추", "넣지 말", "서지 말", "받지 말", "보내지 말", "재검"];
      const NEG = /(말게|아닐세|어렵네|이르네|멈추게|오지 않네|달라지지 않네|돌아오지 않네|아니네)/;
      const first = (t) => (String(t).match(/^[^.!?]*[.!?]?/) || [""])[0];
      const sents = a.split(/(?<=[.!?])\s+/).filter(Boolean);
      const ok = a.length >= 12 && a.length <= 150 && sents.length <= 4 && /(네|게|세|지)[.!]?$/.test(a)
        && !/[一-龥]|\d\s*월|봄머리|당신|그대(?!로)/.test(a) && (a.match(/\d+/g) || []).every((d) => q.includes(d))
        && (bone.loose || KEEP.every((k) => !base.includes(k) || a.includes(k)))
        && first(a).length <= 34 && !VAGUE_HEAD.test(first(a)) && !VAGUE_ANY.test(a)
        && !BLAME.test(a) && !(DO_NOW.test(base) && HOLD_OFF.test(a)) && !madeUpCount(a, base)
        && !(bone.noWhen && /\d|[0-9]월|봄|여름|가을|겨울/.test(a))
        && (bone.loose
          /* 바닥 문장일 땐 뼈대 말이 아니라 판의 등급과 결이 맞는지만 본다 */
          ? ((bone.grade ?? 0) <= 1
              ? !NEG.test(first(a)) || /서두르지 말게|겁먹지 말게|미루지 말게|놓지 말게|졸이지 말게|혼자 앓지 말게/.test(first(a))
              : !/^(되네|좋네|풀리네|들어오네|트이네|오네|이루어지네|잘되네)[.!]/.test(first(a)))
          : (!(NEG.test(first(base)) && !NEG.test(a))
             && !(!NEG.test(first(base)) && (bone.grade ?? 0) <= 1 && NEG.test(first(a)) && !/서두르지 말게|겁먹지 말게|미루지 말게|놓지 말게|졸이지 말게/.test(first(a)))));
      if (ok) answer = /[.!]$/.test(a) ? a : a + ".";
      else {
        /* 손님 사정이 로그에 남지 않게, 글은 남기지 않고 걸린 까닭만 적는다 */
        const why = [];
        if (!(a.length >= 12 && a.length <= 150)) why.push("길이" + a.length);
        if (sents.length > 4) why.push("문장수" + sents.length);
        if (!/(네|게|세|지)[.!]?$/.test(a)) why.push("말끝");
        if (/[一-龥]/.test(a)) why.push("한자");
        if (/당신|그대(?!로)/.test(a)) why.push("호칭");
        if (!(a.match(/\d+/g) || []).every((d) => q.includes(d))) why.push("없는숫자");
        if (first(a).length > 34) why.push("첫문장길이");
        if (VAGUE_HEAD.test(first(a))) why.push("머뭇거림");
        if (VAGUE_ANY.test(a)) why.push("흐린말");
        if (BLAME.test(a)) why.push("손님탓");
        if (DO_NOW.test(base) && HOLD_OFF.test(a)) why.push("뼈대와어긋남");
        if (madeUpCount(a, base)) why.push("지어낸수");
        if (bone.noWhen && /\d|[0-9]월|봄|여름|가을|겨울/.test(a)) why.push("때없는판에때");
        console.log("answer rejected", why.length ? why.join(",") : "결이어긋남");
      }
    }
    res.setHeader("cache-control", "no-store");
    res.status(200).json(answer ? { sections: clean, answer } : { sections: clean });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "패를 읽다 끊겼다" });
  }
}
