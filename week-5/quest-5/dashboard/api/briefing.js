// GET /api/briefing — "오늘의 카페 브리핑" (Gemini)
// 연결된 카페 데이터(매출/메뉴/재고/예약/생일) + 날씨를 종합해 AI가 브리핑을 생성.
const { getCafeData, getWeather, sendJson, checkAuth } = require('./_lib');

const GEMINI_MODEL = 'gemini-2.5-flash';

function buildContext(data, weather) {
  const y = data.yesterday;
  const top3 = data.topMenus.slice(0, 3);
  const low = data.inventory.lowStock.map((i) => `${i.name}(${i.stock}${i.unit})`);
  const expiring = data.inventory.expiring.map((i) => `${i.name}(~${i.expiry})`);
  const nextParty = data.reservations[0];
  const nextBday = data.birthdays[0];
  return {
    기준일: data.anchor,
    어제매출: `${y.amountLabel}${y.changePct != null ? ` (전일比 ${y.changePct > 0 ? '+' : ''}${y.changePct}%)` : ''}`,
    어제주문수: y.orders,
    이번주누계: `${data.weekTotalLabel}${data.weekChangePct != null ? ` (지난주比 ${data.weekChangePct > 0 ? '+' : ''}${data.weekChangePct}%)` : ''}`,
    인기메뉴TOP3: top3.map((m, i) => `${i + 1}위 ${m.name} ${m.qty}개`),
    날씨: weather ? `${weather.description}, ${weather.temp}°C, 강수확률 ${weather.pop}%` : '정보없음',
    손님예측: weather ? weather.prediction.label : '정보없음',
    발주필요: low.length ? low : '없음',
    유통기한임박: expiring.length ? expiring : '없음',
    다가오는생일파티: nextParty
      ? `${nextParty.date} ${nextParty.pet_name} (${nextParty.package_name}, ${nextParty.status})${nextParty.memo ? ' - ' + nextParty.memo : ''}`
      : '없음',
    생일임박강아지: nextBday ? `${nextBday.pet_name} (D-${nextBday.days_until})` : '없음',
  };
}

function fallbackBriefing(data, weather, ctx) {
  const parts = [];
  parts.push(`어제 매출은 ${ctx.어제매출}, 주문 ${data.yesterday.orders}건이었어요.`);
  if (data.topMenus[0]) parts.push(`판매 1위는 ${data.topMenus[0].name}입니다.`);
  if (weather) parts.push(`오늘 청라 날씨는 ${weather.description}(${weather.temp}°C) — ${weather.prediction.label}, ${weather.prediction.note}`);
  if (data.inventory.lowStock.length) parts.push(`재고 부족: ${data.inventory.lowStock.map((i) => i.name).join(', ')} — 오늘 발주 챙기세요.`);
  if (data.reservations[0]) parts.push(`다가오는 생일파티: ${data.reservations[0].date} ${data.reservations[0].pet_name}(${data.reservations[0].package_name}).`);
  return '🐶 ' + parts.join(' ');
}

function fallbackStrategy(data, weather) {
  const s = [];
  if (weather && weather.prediction.level === 'down') s.push('궂은 날씨 → 펫베이커리·디저트 세트 할인으로 객단가 방어');
  else if (weather && weather.prediction.level === 'up') s.push('방문 증가 예상 → 브런치·음료 재료 넉넉히, 회전율 극대화');
  if (data.inventory.lowStock.length) s.push(`긴급 발주(${data.inventory.lowStock.slice(0, 2).map((i) => i.name).join(', ')}) 오늘 처리로 품절 방지`);
  if (data.reservations[0]) s.push(`생일파티 ${data.reservations.length}건 → 포토존 후기 이벤트로 원정 손님 유입`);
  if (data.birthdays[0] && data.birthdays[0].days_until <= 7) s.push(`생일 임박 ${data.birthdays[0].pet_name}(D-${data.birthdays[0].days_until}) 견주께 파티 패키지 제안`);
  const extras = [
    '고마진 상품(펫케이크·생일파티 패키지) 업셀로 마진 강화',
    'SNS 생일파티 인증샷 이벤트로 재방문·신규 유입',
    '단골 멍멍이 방문주기 관리로 리텐션 강화',
  ];
  while (s.length < 3) s.push(extras.shift());
  return s.slice(0, 3);
}

async function callGemini(ctx) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no GEMINI_API_KEY');

  const prompt = `너는 청라 반려견 브런치·생일파티 카페 "멍스데이(Mongsday)"의 AI 경영 매니저야.
아래 실제 운영 데이터를 바탕으로 두 가지를 만들어줘.

1) briefing: 사장님께 드리는 "오늘의 카페 브리핑".
   - 한국어 4~6문장, 따뜻하고 실행 가능한 톤.
   - 매출(어제/이번주 증감) → 인기 메뉴 → 날씨/손님 예측 → 발주/유통기한 → 생일파티 예약 순으로 자연스럽게 엮기.
   - 이모지 1~3개, "사장님" 호칭, 마크다운/제목/불릿 없이 자연스러운 문단.

2) strategy: "오늘의 경영 전략" 정확히 3개.
   - 각 항목은 30자 내외의 짧고 강한 실행 문장 (예: "궂은 날씨 → 펫베이커리 세트 할인으로 객단가 방어").
   - 멍스데이는 '커피는 미끼, 케이크·생일파티에서 마진을 남기는' 구조임을 고려해 고마진 상품 업셀·재방문·원정손님 유입·품절 방지 관점으로.

공통: 숫자는 아래 데이터 그대로 쓰고 절대 지어내지 말 것.

[데이터]
${JSON.stringify(ctx, null, 2)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 900,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            briefing: { type: 'string' },
            strategy: { type: 'array', items: { type: 'string' } },
          },
          required: ['briefing', 'strategy'],
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('').trim();
  if (!text) throw new Error('gemini empty');
  const parsed = JSON.parse(text);
  const briefing = String(parsed.briefing || '').trim();
  const strategy = Array.isArray(parsed.strategy)
    ? parsed.strategy.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!briefing) throw new Error('gemini no briefing');
  return { briefing, strategy };
}

module.exports = async (req, res) => {
  if (!checkAuth(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    const [data, weather] = await Promise.all([
      getCafeData(),
      getWeather().catch((e) => { console.warn('[briefing] weather:', e.message); return null; }),
    ]);
    const ctx = buildContext(data, weather);

    let briefing;
    let strategy;
    let ai = true;
    try {
      const g = await callGemini(ctx);
      briefing = g.briefing;
      strategy = g.strategy && g.strategy.length ? g.strategy : fallbackStrategy(data, weather);
    } catch (e) {
      console.warn('[briefing] gemini fallback:', e.message);
      briefing = fallbackBriefing(data, weather, ctx);
      strategy = fallbackStrategy(data, weather);
      ai = false;
    }

    sendJson(res, 200, {
      briefing,
      strategy,
      ai,
      model: ai ? GEMINI_MODEL : 'rule-based',
      context: ctx,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[briefing]', e);
    sendJson(res, 500, { error: '브리핑 생성 실패: ' + e.message });
  }
};
