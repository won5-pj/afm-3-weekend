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
  console.warn('[WARN] GEMINI_API_KEY 가 없습니다. /api/nickname 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
}

// 별명 생성용 system 프롬프트
const SYSTEM_PROMPT = [
  '너는 사람의 이름·성격·취미 같은 정보를 바탕으로 재미있고 센스있는 "별명(닉네임)"을 지어주는 작명 전문가다.',
  '',
  '[규칙]',
  '- 입력받은 정보(이름, 성격, 취미, 기타 특징)를 적극 반영해서 그 사람만의 개성있는 별명을 만든다.',
  '- 별명은 한국어로, 짧고 부르기 쉽고 기억에 남게 만든다. (보통 2~8글자 내외)',
  '- 분위기를 다양하게 섞는다: 귀여운 것, 웃긴 것, 멋있는 것, 말장난(언어유희)을 활용한 것 등.',
  '- 말장난은 이름이나 취미의 발음/뜻을 비틀어 재치있게 만든다.',
  '- 각 별명마다 "왜 이런 별명인지" 한 줄짜리 재미있는 설명을 붙인다.',
  '- 비방·차별·외모 비하 등 상처를 줄 수 있는 표현은 절대 쓰지 않는다. 긍정적이고 유쾌하게.',
  '- 입력 정보가 부족해도 주어진 것만으로 최선을 다해 창의적으로 만든다.',
].join('\n');

// 별명 스타일(테마)별 추가 지시문. 프런트엔드의 style 키와 일치해야 한다.
const STYLE_GUIDE = {
  free: '특정 테마에 얽매이지 말고 다양한 분위기를 자유롭게 섞어서 만들어라.',
  game: '게임 캐릭터/아이디 느낌으로 만들어라. RPG 직업·길드원·전사·마법사 같은 판타지 게이머 감성, 중2병스럽고 강렬하거나 멋진 닉네임도 환영. (예: 어둠의기사단, 폭풍칼날, 힐링성녀)',
  animal: '동물에 빗댄 귀엽고 친근한 별명으로 만들어라. 그 사람의 성격·취미와 어울리는 동물을 골라 의인화한다. (예: 책읽는 부엉이, 빵굽는 다람쥐)',
  english: '영어권 이름/닉네임 스타일로 만들어라. 실제 영어 이름이나 영어 단어를 활용하되, 한글 표기와 영문 철자를 함께 보여준다. (예: 써니(Sunny), 베이커밥(Baker Bob))',
  food: '음식에 빗댄 맛있고 사랑스러운 별명으로 만들어라. 성격·취미와 어울리는 음식이면 좋다. (예: 달콤마카롱, 든든국밥)',
  fantasy: '신화·판타지 세계관의 칭호나 이명(별칭) 느낌으로 웅장하고 멋지게 만들어라. (예: 새벽을 여는 자, 고요의 현자)',
};

// 구조화 출력 스키마: 별명 배열
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    nicknames: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nickname: { type: 'string', description: '추천 별명' },
          reason: { type: 'string', description: '이 별명을 지은 재미있는 이유 한 줄' },
        },
        required: ['nickname', 'reason'],
      },
    },
  },
  required: ['nicknames'],
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
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

// POST /api/nickname: 사용자 정보 → Gemini 로 별명 추천
async function handleNickname(req, res) {
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

  const name = (body.name || '').toString().trim();
  const personality = (body.personality || '').toString().trim();
  const hobby = (body.hobby || '').toString().trim();
  const extra = (body.extra || '').toString().trim();
  const count = Math.min(Math.max(parseInt(body.count, 10) || 6, 3), 12);
  const styleKey = STYLE_GUIDE[body.style] ? body.style : 'free';

  if (!name && !personality && !hobby && !extra) {
    return sendJson(res, 400, { error: '이름·성격·취미 중 최소 한 가지는 입력해 주세요.' });
  }

  const userPrompt = [
    '다음 사람에게 어울리는 재미있는 별명을 추천해줘.',
    '',
    name ? `- 이름: ${name}` : null,
    personality ? `- 성격: ${personality}` : null,
    hobby ? `- 취미: ${hobby}` : null,
    extra ? `- 기타 특징: ${extra}` : null,
    '',
    `[스타일] ${STYLE_GUIDE[styleKey]}`,
    '',
    `위 스타일을 지키면서, 서로 분위기가 겹치지 않게 ${count}개를 만들어줘.`,
  ].filter((l) => l !== null).join('\n');

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
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 1.1,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
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
    const text = candidate &&
      candidate.content &&
      Array.isArray(candidate.content.parts) &&
      candidate.content.parts.map((p) => p && p.text).filter(Boolean).join('');

    if (!text) {
      const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
      const msg = blockReason
        ? `요청이 안전 정책으로 차단되었습니다 (${blockReason}).`
        : 'Gemini 응답에서 별명을 찾을 수 없습니다.';
      return sendJson(res, 502, { error: msg });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      return sendJson(res, 502, { error: '별명 데이터 형식을 해석하지 못했습니다.' });
    }

    const nicknames = Array.isArray(parsed.nicknames)
      ? parsed.nicknames
          .filter((n) => n && typeof n.nickname === 'string' && n.nickname.trim())
          .map((n) => ({
            nickname: n.nickname.trim(),
            reason: (n.reason || '').toString().trim(),
          }))
      : [];

    if (nicknames.length === 0) {
      return sendJson(res, 502, { error: '생성된 별명이 없습니다. 다시 시도해 주세요.' });
    }

    return sendJson(res, 200, { nicknames });
  } catch (e) {
    console.error('[Network/Fetch error]', e);
    return sendJson(res, 500, { error: 'Gemini 호출 중 네트워크 오류가 발생했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

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

  if (urlPath === '/api/nickname') {
    if (req.method === 'POST') {
      handleNickname(req, res);
    } else {
      sendJson(res, 405, { error: 'POST 메서드만 허용됩니다.' });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`별명 생성기가 열렸습니다! http://localhost:${PORT}/`);
});
