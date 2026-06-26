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

// --- API 키 로딩: process.env 우선, 없으면 같은 폴더의 .env 직접 파싱 (의존성 없음) ---
function loadApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'OPENAI_API_KEY') continue;
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

const OPENAI_API_KEY = loadApiKey();
if (!OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY 가 없습니다. /api/chat 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
}

// 고정 system 프롬프트 (불면증 상담 챗봇)
const SYSTEM_PROMPT =
  '당신은 따뜻하고 공감적인 불면증 상담 전문가입니다. ' +
  '사용자의 수면 고민을 경청하고, 수면 위생(sleep hygiene)과 인지행동치료(CBT-I) 관점의 ' +
  '실용적인 조언을 부드럽게 제안합니다. 의학적 진단이나 처방은 하지 않으며, ' +
  '증상이 심각하거나 2주 이상 지속되면 전문의 상담을 권유합니다. ' +
  '답변은 한국어로, 공감 → 구체적 조언 → 격려 흐름으로, 너무 길지 않게 작성하세요.';

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

// POST /api/chat 핸들러: OpenAI Chat Completions 프록시
async function handleChat(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 500, { error: '서버에 OpenAI API 키가 설정되지 않았습니다.' });
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

  // 안전하게 role/content 만 추려서 전달
  const cleaned = history
    .filter((m) => m && typeof m.content === 'string' &&
      (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned];

  try {
    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages,
      }),
    });

    if (!apiRes.ok) {
      let detail = '';
      try {
        const errJson = await apiRes.json();
        detail = (errJson && errJson.error && errJson.error.message) || '';
      } catch (_e) { /* ignore */ }
      console.error('[OpenAI error]', apiRes.status, detail);
      return sendJson(res, 502, {
        error: `OpenAI API 오류 (${apiRes.status})${detail ? ': ' + detail : ''}`,
      });
    }

    const data = await apiRes.json();
    const reply = data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!reply) {
      return sendJson(res, 502, { error: 'OpenAI 응답에서 답변을 찾을 수 없습니다.' });
    }

    return sendJson(res, 200, { reply });
  } catch (e) {
    console.error('[Network/Fetch error]', e);
    return sendJson(res, 500, { error: 'OpenAI 호출 중 네트워크 오류가 발생했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

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
  console.log(`Server running at http://localhost:${PORT}/`);
});
