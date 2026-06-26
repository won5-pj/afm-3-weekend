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

// --- 컨텍스트(.md) 로딩: 서버가 about-me.md 를 읽어 AI 에게 함께 전달한다 ---
// 매 요청마다 최신 파일을 읽도록 함수로 분리 (파일을 수정해도 서버 재시작 불필요)
const CONTEXT_FILE = 'about-me.md';
function loadContext() {
  try {
    return fs.readFileSync(path.join(ROOT, CONTEXT_FILE), 'utf-8').trim();
  } catch (_e) {
    console.warn(`[WARN] ${CONTEXT_FILE} 를 읽을 수 없습니다.`);
    return '';
  }
}

// system 프롬프트: .md 내용만을 근거로 답하고, 없는 내용은 "몰라요." 로 답하게 한다.
function buildSystemPrompt(context) {
  return [
    '너는 "오상원"이라는 사람에 대한 질문에 답하는 Q&A 도우미다.',
    '아래 <자기소개> 문서에 적힌 내용만을 근거로 답해야 한다.',
    '',
    '[규칙]',
    '- 반드시 아래 문서에 명시된 내용만으로 답한다.',
    '- 문서에 없는 내용을 묻거나, 문서로 알 수 없는 질문에는 추측하지 말고 정확히 "몰라요." 라고만 답한다.',
    '- 문서 내용을 지어내거나 과장하지 않는다.',
    '- 항상 한국어로, 간결하고 친절하게 답한다.',
    '',
    '<자기소개>',
    context || '(문서 내용이 비어 있습니다. 모든 질문에 "몰라요." 라고 답하세요.)',
    '</자기소개>',
  ].join('\n');
}

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

// POST /api/chat 핸들러: 질문 + .md 컨텍스트를 함께 Gemini 에 전달
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

  // 서버가 .md 를 읽어 system_instruction 으로 함께 전달한다.
  const context = loadContext();
  const systemPrompt = buildSystemPrompt(context);

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
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.2 },
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
  console.log(`StoryMe 서버가 열렸습니다! http://localhost:${PORT}/`);
  console.log(`컨텍스트 파일: ${CONTEXT_FILE}`);
});
