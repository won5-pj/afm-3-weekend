const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;

// 이미지 생성 모델 (Gemini "nano-banana" 계열)
const GEMINI_MODEL = 'gemini-2.5-flash-image';

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
  console.warn('[WARN] GEMINI_API_KEY 가 없습니다. /api/generate 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
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
      if (raw.length > 25e6) { // 25MB 초과 시 차단 (업로드 이미지 base64 포함 대비)
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

// POST /api/generate 핸들러: Gemini 이미지 생성 프록시
async function handleGenerate(req, res) {
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

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return sendJson(res, 400, { error: '프롬프트(prompt)가 필요합니다.' });
  }

  // 요청 파트 구성. 선택적 원본 이미지(data URL)가 있으면 이미지→이미지 "변환" 모드.
  const parts = [];
  if (typeof body.image === 'string' && body.image.startsWith('data:')) {
    const m = body.image.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      return sendJson(res, 400, { error: '원본 이미지 형식이 올바르지 않습니다. (data URL 필요)' });
    }
    parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  parts.push({ text: prompt });

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
        contents: [{ parts }],
        // 이미지 모델이 이미지를 반드시 출력하도록 응답 모달리티를 명시한다.
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
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
    const respParts = (candidate && candidate.content && candidate.content.parts) || [];

    let imageDataUrl = null;
    let caption = '';
    for (const p of respParts) {
      if (p && p.inlineData && p.inlineData.data) {
        const mime = p.inlineData.mimeType || 'image/png';
        imageDataUrl = `data:${mime};base64,${p.inlineData.data}`;
      } else if (p && typeof p.text === 'string') {
        caption += p.text;
      }
    }

    if (!imageDataUrl) {
      const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
      const finishReason = candidate && candidate.finishReason;
      let msg;
      if (blockReason || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'SAFETY') {
        msg = '요청이 안전·저작권 정책으로 차단되었습니다. (저작권이 있는 캐릭터/브랜드 이름은 피하고, 스타일 특징으로 풀어서 적어보세요.)';
      } else if (finishReason === 'RECITATION') {
        msg = '저작권 보호 콘텐츠로 판단되어 차단되었습니다. 프롬프트를 바꿔 다시 시도해 주세요.';
      } else {
        msg = '이미지를 생성하지 못했습니다. 프롬프트를 더 구체적으로 작성해 주세요.';
      }
      return sendJson(res, 502, { error: msg });
    }

    return sendJson(res, 200, { image: imageDataUrl, caption: caption.trim() });
  } catch (e) {
    console.error('[Network/Fetch error]', e);
    return sendJson(res, 500, { error: 'Gemini 호출 중 네트워크 오류가 발생했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent directory traversal: 정규화 후 ROOT 경계 안에 있는지 엄격히 확인
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  // 민감 파일 보호: .env 등 점(.)으로 시작하는 숨김 파일은 절대 서빙하지 않는다.
  // (정상 경로로 ROOT 안에 있어도 API 키가 든 .env 가 노출되면 프록시의 의미가 사라짐)
  if (path.basename(filePath).startsWith('.')) {
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
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/generate') {
    if (req.method === 'POST') {
      handleGenerate(req, res);
    } else {
      sendJson(res, 405, { error: 'POST 메서드만 허용됩니다.' });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`이미지 스튜디오가 열렸습니다! http://localhost:${PORT}/`);
});
