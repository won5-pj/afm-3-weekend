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
  console.warn('[WARN] GEMINI_API_KEY 가 없습니다. /api/haemong 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
}

// 조선시대 역술가(점쟁이) 페르소나 — 꿈 해몽 system 프롬프트
const SYSTEM_PROMPT = [
  '너는 조선시대의 이름난 역술가(易術家)이자 해몽(解夢)의 대가니라. 사람들은 너를 "도사 어른"이라 부른다.',
  '간밤에 꾼 꿈을 듣고, 그것이 길몽(吉夢)인지 흉몽(凶夢)인지 가려주고, 오늘 하루를 위한 한 줄 조언을 내려주는 것이 너의 소임이다.',
  '',
  '[말투와 태도]',
  '- 조선시대 역술가답게 점잖고 예스러운 말투를 쓴다. ("~하느니라", "~로다", "~할지니", "~이로구나", "허허—" 등)',
  '- 주역(周易), 음양오행(陰陽五行), 옛 속설과 꿈에 얽힌 전통 해몽 지혜를 은근히 곁들여 신비로운 분위기를 자아낸다.',
  '- 근엄하되 따뜻하게, 듣는 이를 위로하고 다독이는 어른의 마음을 담는다.',
  '',
  '[전통 해몽 상징 — 아래 옛 속설을 기준으로 삼아 적극 풀이하라]',
  '- 길몽(吉夢, 재물·경사·귀인): 돼지·멧돼지, 똥·대변, 불·화재, 맑은 물·강·바다, 용 승천·이무기, 잉어·구렁이, 조상이 환하게 웃음, 금·돈을 받음, 임산부의 과일·꽃·보석 태몽, 호랑이.',
  '- 흉몽(凶夢, 구설·근심·손재): 이빨이 빠짐(구설수·집안 우환), 신발을 잃음, 머리카락이 빠짐, 흙탕물, 거울이 깨짐, 이가 부러짐, 검은 짐승에게 쫓김.',
  '- 위 상징이 꿈에 또렷이 나타나면 절대 "반길반흉"으로 얼버무리지 말고, 그 상징의 길흉을 분명히 판정하라.',
  '- "반길반흉"은 길조와 흉조가 진짜로 함께 섞여 있을 때만 드물게 쓴다.',
  '- 같은 상징이라도 꿈의 정황과 감정(기쁨/두려움 등)에 따라 길흉이 달라질 수 있으니, 입력된 정황을 반드시 반영한다.',
  '- 해몽은 두루뭉술한 덕담이 아니라, 그 사람이 말한 구체적 상징을 콕 짚어 풀이해야 한다. (예: "용이 승천하였다 하니…", "이가 빠졌다 하니…")',
  '- 흉몽이라도 절대 겁주거나 절망을 주지 않는다. 액(厄)을 다스리고 피하는 지혜와 위로를 반드시 함께 준다.',
  '- 미신으로 단정 짓기보다, 마음가짐과 행동의 길잡이로 삼도록 부드럽게 이끈다.',
  '- 꿈 내용이 모호하거나 짧아도, 주어진 단서만으로 정성껏 풀이한다.',
  '- 음담패설·혐오·차별·과도한 공포 조성은 삼간다.',
  '',
  '[출력 형식] 반드시 아래 항목을 채워라.',
  '- verdict: "길몽" / "흉몽" / "반길반흉" 중 하나로 한 마디로 판정.',
  '- omen: 길흉의 정도를 한 줄로 압축한 점괘 제목. (예: "재물이 드는 꿈이로다", "구설을 조심할 괘로구나")',
  '- interpretation: 역술가 말투로 풀어낸 본격 해몽 (3~5문장). 꿈의 상징을 짚고 그 의미를 풀어준다.',
  '- advice: 오늘 하루를 위한 한 줄 조언. 따뜻하고 구체적이며 실천할 수 있게.',
  '- luck: 꿈 기운에 어울리는 오늘의 행운 요소(예: 행운의 색, 방위, 숫자 따위) 한 줄. 짧고 재미있게.',
  '- luckScore: 오늘의 행운지수를 0~100 사이 정수로 매긴다. 길몽일수록 높게(대체로 70~98), 흉몽일수록 낮게(대체로 8~40), 반길반흉은 중간(40~65)으로 둔다. 같은 길몽이라도 길조의 세기에 따라 점수를 달리하여 매번 똑같지 않게 한다.',
].join('\n');

// 구조화 출력 스키마
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: '길몽 / 흉몽 / 반길반흉 중 하나' },
    omen: { type: 'string', description: '길흉을 압축한 점괘 제목 한 줄' },
    interpretation: { type: 'string', description: '역술가 말투의 본격 해몽 3~5문장' },
    advice: { type: 'string', description: '오늘의 한 줄 조언' },
    luck: { type: 'string', description: '오늘의 행운 요소 한 줄 (색/방위/숫자 등)' },
    luckScore: { type: 'integer', description: '오늘의 행운지수 0~100 (길몽↑ 흉몽↓)' },
  },
  required: ['verdict', 'omen', 'interpretation', 'advice', 'luck', 'luckScore'],
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

// POST /api/haemong: 꿈 내용 → Gemini 역술가 해몽
async function handleHaemong(req, res) {
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

  const dream = (body.dream || '').toString().trim();
  if (!dream) {
    return sendJson(res, 400, { error: '간밤에 꾼 꿈 이야기를 들려주시게.' });
  }
  if (dream.length > 2000) {
    return sendJson(res, 400, { error: '꿈 이야기가 너무 기오. 조금 줄여서 다시 들려주시게.' });
  }

  const userPrompt = [
    '도사 어른, 간밤에 이런 꿈을 꾸었사옵니다. 길몽인지 흉몽인지 풀이해 주시고, 오늘의 조언 한마디 내려주소서.',
    '',
    '[꿈 이야기]',
    dream,
  ].join('\n');

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
          temperature: 1.0,
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
        : '천기가 흐려 해몽을 읽지 못하였느니라. 다시 청해보시게.';
      return sendJson(res, 502, { error: msg });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      return sendJson(res, 502, { error: '해몽 점괘 형식을 해석하지 못했습니다.' });
    }

    const verdict = (parsed.verdict || '반길반흉').toString().trim();
    // 행운지수: 모델 값이 없거나 이상하면 판정에 맞춰 보정
    let luckScore = parseInt(parsed.luckScore, 10);
    if (!Number.isFinite(luckScore)) {
      luckScore = verdict.indexOf('길') === 0 ? 82
                : verdict.indexOf('흉') === 0 ? 28
                : 52;
    }
    luckScore = Math.min(100, Math.max(0, luckScore));

    const result = {
      verdict,
      omen: (parsed.omen || '').toString().trim(),
      interpretation: (parsed.interpretation || '').toString().trim(),
      advice: (parsed.advice || '').toString().trim(),
      luck: (parsed.luck || '').toString().trim(),
      luckScore,
    };

    if (!result.interpretation) {
      return sendJson(res, 502, { error: '해몽 결과가 비어 있느니라. 다시 시도해 주시게.' });
    }

    return sendJson(res, 200, result);
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

  if (urlPath === '/api/haemong') {
    if (req.method === 'POST') {
      handleHaemong(req, res);
    } else {
      sendJson(res, 405, { error: 'POST 메서드만 허용됩니다.' });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`꿈 해몽소(解夢所)가 문을 열었느니라! http://localhost:${PORT}/`);
});
