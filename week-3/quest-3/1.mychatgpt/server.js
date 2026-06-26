const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

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

// 사용할 Gemini 모델
const GEMINI_MODEL = 'gemini-2.5-flash';

// --- API 키 로딩: process.env 우선, 없으면 같은 폴더의 .env 직접 파싱 (의존성 없음) ---
// GEMINI_API_KEY 를 우선 사용하되, 예전 키 이름(OPENAI_API_KEY)도 호환을 위해 함께 읽는다.
function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'GEMINI_API_KEY' && key !== 'OPENAI_API_KEY') continue;
      let val = trimmed.slice(eq + 1).trim();
      // 따옴표 제거
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.trim();
    }
  } catch (_e) {
    // .env 없음 → 아래에서 경고 처리
  }
  return '';
}

const GEMINI_API_KEY = loadApiKey();
if (!GEMINI_API_KEY) {
  console.warn('[WARN] GEMINI_API_KEY 가 없습니다. /api/chat 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
}

// 고정 system 프롬프트 — 던전 앤 드래곤 상점의 고블린 코디네이터
// 캐릭터: 유쾌하고 호탕한 고블린 상인. 필요한 물건을 말하면 "현실에 실제로 존재하는
// 브랜드"와 "구체적 제품"을 신나게 추천해 준다.
const SYSTEM_PROMPT = [
  '너는 던전 앤 드래곤(D&D) 세계관의 떠들썩한 모험가 시장 한복판에서 잡화점을 운영하는 고블린 상인 "그리즐납(Grizznab)"이다.',
  '키는 작지만 입담은 누구보다 크고, 늘 헤헤거리며 웃고, 호탕하고 유쾌하게 손님을 맞이한다.',
  '',
  '[성격과 말투]',
  '- 활기차고 호탕하며 능청스럽다. "헤헤!", "오호라!", "이런 좋은 손님을 봤나!" 같은 추임새를 자연스럽게 섞는다.',
  '- 손님을 "모험가 양반", "귀하신 손님" 같이 너스레 떨며 부른다.',
  '- 장사꾼 특유의 능청과 유머를 담되, 추천 정보 자체는 솔직하고 쓸모 있게 준다.',
  '- 너무 길게 늘어놓지 말고, 신나면서도 핵심을 짚어 추천한다.',
  '',
  '[역할 — 코디네이터]',
  '- 손님이 "필요한 물건"이나 상황/예산/취향을 말하면, 거기에 어울리는 추천을 해 준다.',
  '- ★중요★ 브랜드와 제품은 반드시 "현실에 실제로 존재하는 것"으로 추천한다. 옷·패션(예: 유니클로, 나이키, 무신사 입점 브랜드), 음식·식품, 화장품·스킨케어(예: 이니스프리, 라네즈, 키엘), 전자제품, 생활용품 등 실제 브랜드와 실제 제품명을 댄다.',
  '- 절대 가상의/판타지 브랜드나 제품을 지어내지 않는다. 캐릭터(고블린)는 판타지지만, 추천하는 물건은 현실 제품이다.',
  '- 추천은 이렇게 구성한다: ① 손님 요구 요약(한 줄, 너스레) → ② 추천 브랜드/제품 2~3개(각각 "브랜드 - 제품명", 한 줄 특징, 대략적인 실제 가격대를 원화로) → ③ 한마디 강력 추천 멘트.',
  '- 가격은 흥정하듯 재치있게 말하되 현실적인 가격대(원화)로 제시한다.',
  '- 손님이 막연하게 말하면 용도·예산·취향을 한두 가지 되물어 더 잘 맞춰 준다.',
  '- 확실하지 않은 제품 정보는 지어내지 말고, 대표적이고 널리 알려진 실제 제품 위주로 안전하게 추천한다.',
  '',
  '항상 한국어로, 캐릭터(고블린 상인)의 유쾌한 말투는 유지하되 추천 물건은 현실 제품으로 답한다.',
].join('\n');

// JSON 응답 헬퍼
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// 요청 본문(JSON) 읽기
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) { // 1MB 초과 시 차단
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_e) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

// POST /api/chat 핸들러: Google Gemini generateContent 프록시
async function handleChat(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 500, { error: '서버에 Gemini API 키가 설정되지 않았습니다.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    const msg = e.message === 'PAYLOAD_TOO_LARGE'
      ? '요청 본문이 너무 큽니다.'
      : '요청 본문 JSON 형식이 올바르지 않습니다.';
    return sendJson(res, 400, { error: msg });
  }

  const history = Array.isArray(body.messages) ? body.messages : null;
  if (!history) {
    return sendJson(res, 400, { error: 'messages 배열이 필요합니다.' });
  }

  // user/assistant 만 추려 Gemini 형식(contents)으로 변환한다.
  // Gemini 역할: 'user' / 'model' (assistant → model). system 프롬프트는 system_instruction 으로 따로 전달.
  const contents = history
    .filter((m) => m && typeof m.content === 'string' &&
      (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return sendJson(res, 400, { error: '대화 내용이 비어 있습니다.' });
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.9 },
      }),
    });

    if (!apiRes.ok) {
      let detail = '';
      try {
        const errJson = await apiRes.json();
        detail = (errJson && errJson.error && errJson.error.message) || '';
      } catch (_e) { /* ignore */ }
      console.error('[Gemini error]', apiRes.status, detail);
      return sendJson(res, 502, {
        error: `Gemini API 오류 (${apiRes.status})${detail ? ': ' + detail : ''}`,
      });
    }

    const data = await apiRes.json();

    // 안전성 차단 등으로 후보가 비어 있는 경우 처리
    const candidate = data && data.candidates && data.candidates[0];
    const reply = candidate &&
      candidate.content &&
      Array.isArray(candidate.content.parts) &&
      candidate.content.parts.map((p) => p && p.text).filter(Boolean).join('');

    if (!reply) {
      const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
      const msg = blockReason
        ? `요청이 안전 정책으로 차단되었습니다 (${blockReason}).`
        : 'Gemini 응답에서 답변을 찾을 수 없습니다.';
      return sendJson(res, 502, { error: msg });
    }

    return sendJson(res, 200, { reply });
  } catch (e) {
    console.error('[Network/Fetch error]', e);
    return sendJson(res, 500, { error: 'Gemini 호출 중 네트워크 오류가 발생했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 점(.)으로 시작하는 파일/폴더(.env, .git 등)는 절대 노출하지 않는다 — API 키 유출 방지
  if (urlPath.split('/').some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // Prevent directory traversal
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
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
  const urlPath = req.url.split('?')[0];

  // API 라우트
  if (urlPath === '/api/chat') {
    if (req.method === 'POST') {
      handleChat(req, res);
    } else {
      sendJson(res, 405, { error: 'POST 메서드만 허용됩니다.' });
    }
    return;
  }

  // 그 외에는 정적 파일
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`고블린 상점이 문을 열었습니다! http://localhost:${PORT}/`);
});
