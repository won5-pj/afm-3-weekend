const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
const ROOT = __dirname;

// CoinGecko 공개 API (Demo 키는 선택 사항)
const CG_HOST = 'api.coingecko.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- API 키 로딩(선택): process.env 우선, 없으면 같은 폴더 .env 직접 파싱 (의존성 없음) ---
function loadApiKey() {
  if (process.env.COINGECKO_API_KEY) return process.env.COINGECKO_API_KEY.trim();
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'COINGECKO_API_KEY') continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.trim();
    }
  } catch (_e) {
    // .env 없음 → 키 없이 공개 한도로 동작
  }
  return '';
}

const CG_KEY = loadApiKey();
if (CG_KEY) {
  console.log('[info] CoinGecko Demo API 키가 적용되었습니다.');
} else {
  console.log('[info] CoinGecko 키 없이 공개 한도로 동작합니다. (.env 에 COINGECKO_API_KEY 추가 시 한도 상향)');
}

// --- Gemini(AI 코멘트) 키 로딩: process.env 우선, 없으면 .env 직접 파싱 (CoinGecko 로더와 동일 스타일) ---
const GEMINI_MODEL = 'gemini-2.5-flash';
function loadGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'GEMINI_API_KEY') continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.trim();
    }
  } catch (_e) {
    // .env 없음 → 키 없이 동작, AI 코멘트는 graceful degradation
  }
  return '';
}

const GEMINI_KEY = loadGeminiKey();
if (GEMINI_KEY) {
  console.log('[info] Gemini AI 코멘트 레이어가 활성화되었습니다.');
} else {
  console.log('[info] Gemini 키 없음 → AI 코멘트 없이 시세·분석만 제공합니다. (.env 에 GEMINI_API_KEY 추가 시 활성화)');
}

// AI 트레이더 코멘트용 시스템 프롬프트: 냉정하고 균형 잡힌 한국 암호화폐 트레이더 톤
const AI_SYSTEM_PROMPT = [
  '너는 냉정하고 균형 잡힌 시각을 가진 한국의 베테랑 암호화폐 트레이더다.',
  '제공되는 기술적 분석 데이터(추세, 매물대 지지/저항, 이동평균, 자체 추천 액션·신뢰도, 분석 근거)를 바탕으로,',
  '한국어로 2~3문장짜리 간결한 "트레이더 코멘트"를 작성한다.',
  '',
  '[규칙]',
  '- 제공된 데이터(숫자·추세·매물대·자체 추천)만 근거로 해석한다. 데이터에 없는 가격·수치·지표를 절대 지어내지 마라.',
  '- 추세와 매물대를 엮어 현재 상황을 균형 있게 설명한다(상방 가능성과 하방 위험을 함께 짚는다).',
  '- "반드시 오른다/수익 보장/지금 사라" 같은 단정적 투자 권유나 수익 보장은 금지한다.',
  '- 마지막은 "투자 판단과 책임은 본인에게 있다"는 뉘앙스를 자연스럽게 담아 마무리한다.',
  '- 과장·이모지 남용 없이, 침착하고 전문적인 톤을 유지한다. 2~3문장을 넘기지 마라.',
].join('\n');

// 코인 id -> { at, result } : 분석 결과(+aiComment) TTL 캐시. 매 요청마다 Gemini 재호출 방지(레이트리밋/비용 보호)
const analysisCache = new Map();
const ANALYSIS_TTL = 60000; // 60초

// 분석 결과를 바탕으로 Gemini 한국어 트레이더 코멘트 생성.
// 실패/키없음/타임아웃 시 빈 문자열 반환 → /api/analysis 본문은 그대로 200 (graceful degradation)
async function generateAiComment(analysis, coinId) {
  if (!GEMINI_KEY) return '';
  const rec = analysis.recommendation || {};
  const r0 = (v) => (typeof v === 'number' ? Math.round(v) : null);
  // Gemini 에 넘길 사실 데이터(분석 결과에서 추출, 새 수치 생성 없음)
  const facts = {
    코인: coinId,
    현재가_KRW: r0(analysis.currentPrice),
    추세: rec.trend || null,                 // 상승 | 하락 | 중립
    자체추천: rec.action || null,            // buy | sell | hold
    신뢰도_0to1: typeof rec.confidence === 'number' ? Math.round(rec.confidence * 100) / 100 : null,
    단기이평_ma6: r0(analysis.ma && analysis.ma.ma6),
    장기이평_ma20: r0(analysis.ma && analysis.ma.ma20),
    가까운지지_KRW: analysis.nearestSupport ? r0(analysis.nearestSupport.mid) : null,
    가까운저항_KRW: analysis.nearestResistance ? r0(analysis.nearestResistance.mid) : null,
    매물대수: Array.isArray(analysis.zones) ? analysis.zones.length : 0,
    분석근거: rec.reason || null,
  };

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000); // 8초 타임아웃
  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: '아래 기술적 분석 데이터를 바탕으로 트레이더 코멘트를 작성해줘.\n' + JSON.stringify(facts, null, 2) }],
        }],
        // thinkingBudget:0 → 추론 토큰 소모를 끄고 출력 토큰을 코멘트 본문에 모두 사용(짧은 응답 잘림 방지)
        generationConfig: { temperature: 0.7, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: controller.signal,
    });
    if (!apiRes.ok) {
      let detail = '';
      try { const ej = await apiRes.json(); detail = (ej && ej.error && ej.error.message) || ''; } catch (_e) { /* ignore */ }
      console.error('[ai comment] Gemini 오류', apiRes.status, detail);
      return '';
    }
    const data = await apiRes.json();
    const cand = data && data.candidates && data.candidates[0];
    const text = cand && cand.content && Array.isArray(cand.content.parts)
      ? cand.content.parts.map((p) => p && p.text).filter(Boolean).join('')
      : '';
    return (text || '').trim();
  } catch (e) {
    console.error('[ai comment] 실패', e.name === 'AbortError' ? '시간 초과(8s)' : e.message);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// JSON 응답 헬퍼
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// CoinGecko GET (의존성 없이 https 모듈 사용, 키 있으면 헤더 추가)
function cgGet(apiPath) {
  return new Promise((resolve, reject) => {
    const headers = { 'Accept': 'application/json', 'User-Agent': 'coindash/1.0' };
    if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY;
    const options = { host: CG_HOST, path: apiPath, method: 'GET', headers };
    const apiReq = https.request(options, (apiRes) => {
      let raw = '';
      apiRes.on('data', (chunk) => { raw += chunk; });
      apiRes.on('end', () => {
        let data = null;
        try { data = JSON.parse(raw); } catch (_e) { /* 비정상 응답 */ }
        resolve({ status: apiRes.statusCode, data });
      });
    });
    apiReq.on('error', reject);
    apiReq.setTimeout(10000, () => {
      apiReq.destroy(new Error('CoinGecko 요청 시간 초과'));
    });
    apiReq.end();
  });
}

// 간단한 TTL 캐시 (무료 API 레이트리밋 보호 + 빠른 응답)
const cache = new Map(); // apiPath -> { at, resp }
async function cgGetCached(apiPath, ttlMs) {
  const now = Date.now();
  const hit = cache.get(apiPath);
  if (hit && now - hit.at < ttlMs) {
    return { ...hit.resp, cached: true };
  }
  let resp;
  try {
    resp = await cgGet(apiPath);
  } catch (e) {
    if (hit) return { ...hit.resp, stale: true }; // 네트워크 오류 시 직전 캐시
    throw e;
  }
  if (resp.status === 200 && resp.data) {
    cache.set(apiPath, { at: now, resp });
    return resp;
  }
  // 429 등 오류 시 직전 캐시가 있으면 그것으로 대체 (대시보드가 비지 않도록)
  if (hit) return { ...hit.resp, stale: true };
  return resp;
}

// CoinGecko 마켓 객체 → 대시보드용 형태 + 추세/급변 분석
function analyzeCoin(coin) {
  const pc1hRaw = coin.price_change_percentage_1h_in_currency;
  const pc24hRaw = (typeof coin.price_change_percentage_24h_in_currency === 'number')
    ? coin.price_change_percentage_24h_in_currency
    : coin.price_change_percentage_24h;
  const pc1h = typeof pc1hRaw === 'number' ? pc1hRaw : 0;       // % (1시간)
  const pc24h = typeof pc24hRaw === 'number' ? pc24hRaw : 0;    // % (24시간)

  const spark = (coin.sparkline_in_7d && coin.sparkline_in_7d.price) || [];
  const recent = spark.slice(-24); // 최근 24시간(시간 단위) 흐름

  // 추세: 1시간 변화율 기준 (상승추세=초록 / 하락추세=빨강)
  let trend = 'flat';
  if (pc1h > 0.1) trend = 'up';
  else if (pc1h < -0.1) trend = 'down';

  // 거래 강도: 회전율 = 24h 거래대금 / 시가총액
  const turnover = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
  // 변동성: 최근 24시간 고저 범위
  let volatility = 0;
  if (recent.length >= 2) {
    const mn = Math.min(...recent);
    const mx = Math.max(...recent);
    volatility = mn ? (mx - mn) / mn : 0;
  }
  // 강한 거래량(회전율↑)으로 변동성이 확인되면 급변 신호 ⚡
  const spike = turnover >= 0.15 && (volatility >= 0.06 || Math.abs(pc1h) >= 2);

  return {
    id: coin.id,
    symbol: (coin.symbol || '').toUpperCase(),
    name: coin.name,
    image: coin.image,
    trade_price: coin.current_price,
    signed_change_rate: pc24h / 100,           // 24h 등락률(소수)
    signed_change_price: coin.price_change_24h, // 24h 절대 변동(원)
    change_1h_rate: pc1h / 100,
    acc_trade_price_24h: coin.total_volume,    // 24h 거래대금(원)
    market_cap: coin.market_cap,
    market_cap_rank: coin.market_cap_rank,
    closes: recent,
    trend,
    trendRate: pc1h / 100,
    turnover: Math.round(turnover * 1000) / 1000,
    volatility: Math.round(volatility * 1000) / 1000,
    spike,
  };
}

// GET /api/markets?ids=bitcoin,ethereum  또는  /api/markets?top=100
async function handleMarkets(req, res, query) {
  const ids = (query.get('ids') || '').trim();
  let apiPath;
  if (query.has('ids')) {
    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    if (idList.length === 0) return sendJson(res, 200, { coins: [] });
    apiPath =
      `/api/v3/coins/markets?vs_currency=krw&ids=${encodeURIComponent(idList.join(','))}` +
      `&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d`;
  } else {
    let top = parseInt(query.get('top') || '100', 10);
    if (isNaN(top)) top = 100;
    top = Math.min(250, Math.max(10, top));
    apiPath =
      `/api/v3/coins/markets?vs_currency=krw&order=market_cap_desc&per_page=${top}&page=1` +
      `&sparkline=true&price_change_percentage=1h,24h`;
  }

  try {
    const { status, data, stale } = await cgGetCached(apiPath, 12000);
    if (!Array.isArray(data)) {
      const msg = status === 429
        ? 'CoinGecko 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : `CoinGecko 시세 조회 오류 (${status})`;
      return sendJson(res, status === 429 ? 429 : 502, { error: msg });
    }
    return sendJson(res, 200, { coins: data.map(analyzeCoin), stale: !!stale });
  } catch (e) {
    console.error('[markets error]', e.message);
    return sendJson(res, 500, { error: '시세를 불러오지 못했습니다.' });
  }
}

// GET /api/search?query=bitcoin : 코인 이름/티커 검색
async function handleSearch(req, res, query) {
  const q = (query.get('query') || '').trim();
  if (!q) return sendJson(res, 400, { error: 'query 파라미터가 필요합니다.' });

  const apiPath = `/api/v3/search?query=${encodeURIComponent(q)}`;
  try {
    const { status, data, stale } = await cgGetCached(apiPath, 120000);
    if (!data || !Array.isArray(data.coins)) {
      const msg = status === 429
        ? '검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : `검색 오류 (${status})`;
      return sendJson(res, status === 429 ? 429 : 502, { error: msg });
    }
    const coins = data.coins.slice(0, 15).map((c) => ({
      id: c.id,
      name: c.name,
      symbol: (c.symbol || '').toUpperCase(),
      rank: c.market_cap_rank,
      thumb: c.thumb,
    }));
    return sendJson(res, 200, { coins, stale: !!stale });
  } catch (e) {
    console.error('[search error]', e.message);
    return sendJson(res, 500, { error: '검색에 실패했습니다.' });
  }
}

// 4시간봉 OHLC로 주요 매물대(마켓프로파일) + 추세 기반 추천 포지션 계산
function buildAnalysis(ohlc) {
  // ohlc: [[t,o,h,l,c], ...] 시간 오름차순
  const candles = ohlc
    .filter((r) => Array.isArray(r) && r.length >= 5)
    .map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4] }));
  const n = candles.length;
  const cur = candles[n - 1].c;

  const priceMin = Math.min(...candles.map((c) => c.l));
  const priceMax = Math.max(...candles.map((c) => c.h));

  // --- 매물대: 각 4h 캔들의 [저가,고가] 범위를 가격 구간에 누적 (최근 캔들 가중) ---
  const BINS = 48;
  const binSize = (priceMax - priceMin) / BINS || 1;
  const hist = new Array(BINS).fill(0);
  candles.forEach((c, idx) => {
    const recencyW = 1 + idx / n; // 오래된 1 → 최근 2 가중
    let bLo = Math.floor((c.l - priceMin) / binSize);
    let bHi = Math.floor((c.h - priceMin) / binSize);
    bLo = Math.max(0, Math.min(BINS - 1, bLo));
    bHi = Math.max(0, Math.min(BINS - 1, bHi));
    for (let b = bLo; b <= bHi; b++) hist[b] += recencyW;
  });
  const maxH = Math.max(...hist) || 1;
  const pocBin = hist.indexOf(maxH);
  const pocPrice = priceMin + (pocBin + 0.5) * binSize;

  // 임계치 이상 연속 구간을 하나의 매물대로 병합
  const rawZones = [];
  let i = 0;
  while (i < BINS) {
    if (hist[i] >= 0.55 * maxH) {
      let j = i;
      let peak = 0;
      while (j < BINS && hist[j] >= 0.55 * maxH) { peak = Math.max(peak, hist[j]); j++; }
      const low = priceMin + i * binSize;
      const high = priceMin + j * binSize;
      rawZones.push({ low, high, mid: (low + high) / 2, strength: peak / maxH });
      i = j;
    } else i++;
  }
  // 강도순 상위 4개만, 지지/저항 라벨 부여
  const zones = rawZones
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .map((z) => ({
      low: z.low,
      high: z.high,
      mid: z.mid,
      strength: Math.round(z.strength * 100) / 100,
      role: z.mid >= cur ? 'resistance' : 'support',
      isPOC: pocPrice >= z.low && pocPrice <= z.high,
    }))
    .sort((a, b) => b.mid - a.mid); // 화면 표시는 높은 가격 → 낮은 가격

  const supports = zones.filter((z) => z.role === 'support').sort((a, b) => b.mid - a.mid);
  const resistances = zones.filter((z) => z.role === 'resistance').sort((a, b) => a.mid - b.mid);
  const nearestSupport = supports[0] || null;
  const nearestResistance = resistances[0] || null;

  // --- 추세 판정: 4h 종가 이동평균 + 기울기 ---
  const closes = candles.map((c) => c.c);
  const maOf = (k) => {
    const s = closes.slice(-Math.min(k, n));
    return s.reduce((a, b) => a + b, 0) / s.length;
  };
  const ma6 = maOf(6);    // 약 24시간
  const ma20 = maOf(20);  // 약 3.3일
  const recent = closes.slice(-6);
  const slope = recent[0] ? (recent[recent.length - 1] - recent[0]) / recent[0] : 0;

  let score = 0;
  if (cur > ma20) score++; else score--;
  if (ma6 > ma20) score++; else score--;
  if (slope > 0.005) score++; else if (slope < -0.005) score--;

  let action, trend;
  if (score >= 2) { action = 'buy'; trend = '상승'; }
  else if (score <= -2) { action = 'sell'; trend = '하락'; }
  else { action = 'hold'; trend = '중립'; }

  const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
  const reasonParts = [];
  if (action === 'buy') {
    reasonParts.push('4시간봉이 상승 추세입니다(단기 이동평균이 장기 이평선 위, 현재가가 이평선 위).');
    if (nearestSupport) reasonParts.push(`아래 지지 매물대 ₩${fmt(nearestSupport.mid)} 부근을 지지로 본 매수 우위.`);
  } else if (action === 'sell') {
    reasonParts.push('4시간봉이 하락 추세입니다(단기 이동평균이 장기 이평선 아래).');
    if (nearestResistance) reasonParts.push(`위 저항 매물대 ₩${fmt(nearestResistance.mid)}가 부담, 반등 시 매도 우위.`);
  } else {
    reasonParts.push('방향성이 뚜렷하지 않은 관망 구간입니다.');
    if (nearestResistance) reasonParts.push(`저항 ₩${fmt(nearestResistance.mid)} 돌파`);
    if (nearestSupport) reasonParts.push(`또는 지지 ₩${fmt(nearestSupport.mid)} 이탈 확인 후 진입 권장.`);
  }

  return {
    interval: '4h',
    candleCount: n,
    currentPrice: cur,
    priceMin,
    priceMax,
    poc: pocPrice,
    zones,
    nearestSupport,
    nearestResistance,
    ma: { ma6, ma20 },
    closes: closes.slice(-42), // 모달 미니차트용 (최근 약 7일)
    recommendation: {
      action,           // buy | sell | hold
      trend,            // 상승 | 하락 | 중립
      confidence: Math.min(1, Math.abs(score) / 3),
      reason: reasonParts.join(' '),
    },
  };
}

// GET /api/analysis?id=bitcoin : 4시간봉 매물대 + 추천 포지션
async function handleAnalysis(req, res, query) {
  const id = (query.get('id') || '').trim();
  if (!id) return sendJson(res, 400, { error: 'id 파라미터가 필요합니다.' });

  // 캐시 적중 시 Gemini 재호출 없이 즉시 반환 (aiComment 포함)
  const cached = analysisCache.get(id);
  if (cached && Date.now() - cached.at < ANALYSIS_TTL) {
    return sendJson(res, 200, { ...cached.result, cached: true });
  }

  const apiPath = `/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=krw&days=14`;
  try {
    const { status, data } = await cgGetCached(apiPath, 60000);
    if (!Array.isArray(data) || data.length < 5) {
      const msg = status === 429
        ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : '분석 데이터를 불러오지 못했습니다. (해당 코인의 4시간봉 데이터 부족)';
      return sendJson(res, status === 429 ? 429 : 502, { error: msg });
    }
    const result = buildAnalysis(data);
    // AI 트레이더 코멘트 생성(실패해도 빈 문자열 → 분석 본문은 정상). 결과는 캐시에 함께 저장.
    result.aiComment = await generateAiComment(result, id);
    analysisCache.set(id, { at: Date.now(), result });
    return sendJson(res, 200, result);
  } catch (e) {
    console.error('[analysis error]', e.message);
    return sendJson(res, 500, { error: '분석에 실패했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 디렉터리 탈출 방지
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  // 민감 파일 차단: .env 등 점(.)으로 시작하는 파일과 서버 소스 노출 방지
  const base = path.basename(filePath).toLowerCase();
  if (base.startsWith('.') || base === 'server.js') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = parsed.pathname;

  if (urlPath === '/api/markets') {
    if (req.method === 'GET') return handleMarkets(req, res, parsed.searchParams);
    return sendJson(res, 405, { error: 'GET 메서드만 허용됩니다.' });
  }

  if (urlPath === '/api/search') {
    if (req.method === 'GET') return handleSearch(req, res, parsed.searchParams);
    return sendJson(res, 405, { error: 'GET 메서드만 허용됩니다.' });
  }

  if (urlPath === '/api/analysis') {
    if (req.method === 'GET') return handleAnalysis(req, res, parsed.searchParams);
    return sendJson(res, 405, { error: 'GET 메서드만 허용됩니다.' });
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`코인 대시보드가 열렸습니다! http://localhost:${PORT}/`);
});
