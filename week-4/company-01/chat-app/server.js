// =============================================================================
//  보험 상품 안내 채팅 앱 - 백엔드 서버 (server.js)
//  - Node.js 내장 모듈(http, fs, path)만 사용 → npm 설치 없이 `node server.js` 실행
//  - 정적 파일 서빙(index.html 등) + Gemini AI 채팅 프록시(POST /api/chat)
//  - 상위 폴더의 상품/FAQ .md 문서를 시스템 프롬프트로 주입해 RAG 형태로 답변
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// .env 파일이 있으면 로드 (Node 20.6+ 내장 기능)
try { process.loadEnvFile(); } catch {}

// -----------------------------------------------------------------------------
// 1) 설정값
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

// 정적 파일은 "이 서버 파일이 있는 chat-app 폴더"만 서빙한다.
// (상위 폴더의 .md 문서와 API 키는 절대 정적 경로로 노출되지 않도록 범위를 좁힌다)
const STATIC_ROOT = __dirname;

// 상품/FAQ 문서가 들어 있는 상위 폴더 (company-01)
const DOCS_DIR = path.join(__dirname, '..');

// API 키는 코드에 하드코딩하지 말고 .env 파일의 GEMINI_API_KEY 로 주입한다.
// (https://aistudio.google.com 에서 발급한 AIza... 형식의 Gemini 키)
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
if (!GEMINI_API_KEY) {
  console.warn('⚠️ 환경변수 GEMINI_API_KEY가 비어 있습니다. .env에 설정하세요. (.env.example 참고)');
}
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// -----------------------------------------------------------------------------
// 2) 상품 문서(.md) 읽어서 하나의 컨텍스트 텍스트로 합치기 (서버 시작 시 1회)
// -----------------------------------------------------------------------------
function loadProductDocs() {
  let combined = '';
  try {
    const files = fs
      .readdirSync(DOCS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md'))
      .sort(); // product-... , faq-01 ... 순으로 정렬

    for (const file of files) {
      const full = path.join(DOCS_DIR, file);
      // 폴더가 아닌 일반 파일만
      if (!fs.statSync(full).isFile()) continue;
      const text = fs.readFileSync(full, 'utf-8');
      combined += `\n\n===== 문서: ${file} =====\n${text}`;
    }
    console.log(`[문서 로드] ${files.length}개의 .md 문서를 컨텍스트로 합쳤습니다.`);
  } catch (err) {
    console.error('[문서 로드 실패]', err.message);
  }
  return combined.trim();
}

const PRODUCT_DOCS = loadProductDocs();

// -----------------------------------------------------------------------------
// 3) 시스템 프롬프트(페르소나 + 상품 문서) 구성
// -----------------------------------------------------------------------------
const SYSTEM_PROMPT = `당신은 친절하고 따뜻한 보험 상담사입니다.
고객에게 항상 존댓말로 답하고, "(무)건강든든 종합보험 7990" 상품의 장점을 안내하되,
면책기간 · 고지의무 · 순수보장형(만기환급금 없음) 같은 주의사항도 정직하게 알려 주세요.
아래 [상품 및 FAQ 문서]에 근거해서만 답변하고, 문서에 없는 내용은 절대 지어내지 말고
"정확한 내용은 고객센터(1588-0000)로 문의해 주세요"라고 안내해 주세요.

[상품 및 FAQ 문서]
${PRODUCT_DOCS}`;

// -----------------------------------------------------------------------------
// 4) Gemini API 호출 함수
//    - 클라이언트가 보낸 messages 배열을 Gemini contents 형식으로 변환
//    - assistant → model 로 역할명 변환
// -----------------------------------------------------------------------------
async function callGemini(messages) {
  // 클라이언트 메시지를 Gemini contents 형식으로 변환
  const contents = (messages || [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim() !== '')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user', // Gemini는 model/user만 사용
      parts: [{ text: m.content }],
    }));

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
  };

  // Node 18+ 내장 fetch 사용 (외부 패키지 불필요)
  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API 오류 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();

  // 응답에서 답변 텍스트 추출
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    // 안전 차단(safety block) 등으로 텍스트가 없을 수 있음
    throw new Error('Gemini 응답에서 답변 텍스트를 찾지 못했습니다.');
  }
  return reply;
}

// -----------------------------------------------------------------------------
// 5) 유틸: 요청 본문(JSON) 읽기
// -----------------------------------------------------------------------------
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // 과도하게 큰 본문 방어 (1MB 제한)
      if (raw.length > 1_000_000) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('JSON 파싱 실패: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

// -----------------------------------------------------------------------------
// 6) 유틸: 정적 파일 서빙 (chat-app 폴더 한정 + 디렉터리 탈출/도트파일 차단)
// -----------------------------------------------------------------------------
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
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, urlPath) {
  // '/' 요청은 index.html 로
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 보안: 도트파일(.env, .git 등) 차단 — STATIC_ROOT 안에 있어도 노출 금지
  const segments = rel.split('/').filter(Boolean);
  if (segments.some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // 경로 정규화 후 STATIC_ROOT 밖으로 벗어나는지 확인 (디렉터리 탈출 방지)
  const filePath = path.normalize(path.join(STATIC_ROOT, rel));
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // 파일이 없으면 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

// -----------------------------------------------------------------------------
// 7) HTTP 서버 (라우팅)
// -----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0]; // 쿼리스트링 제거

  // --- 채팅 API: POST /api/chat ---
  if (urlPath === '/api/chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const messages = body.messages;

      if (!Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'messages 배열이 필요합니다.' }));
        return;
      }

      const reply = await callGemini(messages);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error('[/api/chat 오류]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '답변 생성 중 오류가 발생했습니다.' }));
    }
    return;
  }

  // --- 그 외 GET 요청은 정적 파일 서빙 ---
  if (req.method === 'GET') {
    serveStatic(req, res, urlPath);
    return;
  }

  // --- 지원하지 않는 메서드 ---
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

// -----------------------------------------------------------------------------
// 8) 서버 시작
// -----------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log('========================================================');
  console.log('  보험 상품 안내 채팅 서버가 시작되었습니다.');
  console.log(`  http://localhost:${PORT}`);
  console.log('========================================================');
  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      '⚠️  GEMINI_API_KEY 환경변수가 설정되지 않았습니다.\n' +
        '    현재 fallback 키는 OpenAI 형식이라 Gemini 호출이 실패합니다.\n' +
        '    https://aistudio.google.com 에서 AIza... 형식의 키를 발급해\n' +
        '    GEMINI_API_KEY 환경변수로 설정 후 다시 실행하세요.'
    );
  }
});
