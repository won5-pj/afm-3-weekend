// ============================================================
// 냉장고 재료 + 레시피 관리 앱 - 백엔드 서버
// Express + PostgreSQL(Supabase) / 로컬 + Vercel 서버리스 듀얼모드
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// DB 연결 (Supabase 풀러, SSL 필요)
// 접속 정보는 환경변수 DATABASE_URL 로만 주입 (.env 파일 또는 배포 환경변수)
// ------------------------------------------------------------
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL 환경변수가 설정되지 않았습니다. .env 파일에 DATABASE_URL 을 넣거나 배포 환경변수로 설정하세요. (.env.example 참고)'
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 레시피 자동생성(AI)용 Google Gemini 키 (없으면 /api/recipes/generate 만 비활성)
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';

// ------------------------------------------------------------
// DB 초기화 (lazy init: 서버리스 cold start 중복 실행 방지)
// ------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      expiry_date DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // 기존 테이블에도 유통기한 컬럼 보장 (마이그레이션)
  await pool.query('ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS expiry_date DATE;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      ingredients TEXT,
      steps TEXT,
      cook_time TEXT,
      difficulty TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // 기존 테이블에도 예상 조리시간/난이도 컬럼 보장 (마이그레이션)
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time TEXT;');
  await pool.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty TEXT;');
  dbInitialized = true;
}

// ------------------------------------------------------------
// 미들웨어
// ------------------------------------------------------------
app.use(express.json());
app.use(express.static(__dirname)); // 같은 폴더의 index.html 등 정적 파일 서빙

// /api 요청 전에 DB 초기화 보장
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init 실패:', err);
    res.status(500).json({ error: 'Database initialization failed' });
  }
});

// ------------------------------------------------------------
// 재료(ingredients) API
// ------------------------------------------------------------

// 전체 목록 (최신순)
app.get('/api/ingredients', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, category, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, created_at FROM ingredients ORDER BY created_at DESC, id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '재료 목록을 불러오지 못했습니다.' });
  }
});

// 생성
app.post('/api/ingredients', async (req, res) => {
  const { name, category, expiry_date } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name은 필수입니다.' });
  }
  // 유통기한은 선택값. 있으면 YYYY-MM-DD 형식만 허용
  const expiry = (expiry_date ?? '').toString().trim() || null;
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    return res.status(400).json({ error: '유통기한은 YYYY-MM-DD 형식이어야 합니다.' });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO ingredients (name, category, expiry_date) VALUES ($1, $2, $3) RETURNING id, name, category, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, created_at",
      [name.trim(), category ?? null, expiry]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '재료를 추가하지 못했습니다.' });
  }
});

// 삭제
app.delete('/api/ingredients/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM ingredients WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '해당 재료를 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '재료를 삭제하지 못했습니다.' });
  }
});

// ------------------------------------------------------------
// 레시피(recipes) API
// ------------------------------------------------------------

// 전체 목록 (최신순)
app.get('/api/recipes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, ingredients, steps, cook_time, difficulty, created_at FROM recipes ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '레시피 목록을 불러오지 못했습니다.' });
  }
});

// 생성
app.post('/api/recipes', async (req, res) => {
  const { title, ingredients, steps, cook_time, difficulty } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title은 필수입니다.' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps, cook_time, difficulty) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, ingredients, steps, cook_time, difficulty, created_at',
      [title.trim(), ingredients ?? null, steps ?? null, cook_time ?? null, difficulty ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '레시피를 추가하지 못했습니다.' });
  }
});

// 레시피 생성 옵션(mode)별 추가 지침 — 없으면 기본
const MODE_GUIDE = {
  야식: '늦은 밤에 부담 없이 즐길 수 있는 야식 스타일로 만든다. 맵거나 짭짤한 안주·간식류, 술안주로 어울리는 요리를 우선한다.',
  다이어트: '칼로리가 낮고 담백한 다이어트 식단으로 만든다. 기름 사용을 최소화하고 채소·단백질 위주로 구성하며, 튀김·과한 탄수화물은 피한다.',
  간단요리: '재료와 조리 단계를 최소화해 10분 내외로 완성하는 초간단 요리로 만든다. 설거지가 적고 과정이 단순한 요리를 우선한다.',
};

// 자동생성 — DB에 저장된 재료로 AI가 레시피를 만들어 recipes 테이블에 저장
// fridge-recipe 스킬 규칙 적용: 주재료는 DB 재료만, 기본 양념은 허용, 한글 작성
app.post('/api/recipes/generate', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res
      .status(503)
      .json({ error: 'GEMINI_API_KEY가 설정되지 않아 자동생성을 사용할 수 없습니다. (.env 확인)' });
  }
  // 생성 옵션(야식/다이어트/간단요리). 지정되지 않으면 기본 레시피
  const mode = (req.body?.mode ?? '').toString().trim();
  const modeGuide = MODE_GUIDE[mode] || '';
  try {
    // 1) 현재 냉장고 재료 읽기 (유통기한 포함, 임박 순 정렬)
    const { rows: ingredients } = await pool.query(
      "SELECT name, category, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date FROM ingredients ORDER BY expiry_date ASC NULLS LAST, created_at DESC, id DESC"
    );
    if (ingredients.length === 0) {
      return res
        .status(400)
        .json({ error: '냉장고에 재료가 없습니다. 먼저 재료를 추가해주세요.' });
    }
    // 유통기한이 있으면 함께 표기해 AI가 임박 재료를 우선 쓰도록 유도
    const ingredientList = ingredients
      .map((r) => (r.expiry_date ? `${r.name}(유통기한 ${r.expiry_date})` : r.name))
      .join(', ');

    // 2) Gemini 로 레시피 생성 (JSON 형식 강제)
    const systemPrompt =
      '너는 자취생을 위한 냉장고 요리 도우미다. 주어진 냉장고 재료만으로 만들 수 있는 간단한 한국 가정식 레시피 1개를 제안한다. ' +
      '규칙: (1) 주재료(고기·채소·달걀·두부 등 핵심 재료)는 반드시 주어진 재료 목록 안에 있는 것만 사용한다. 목록에 없는 새 주재료를 지어내지 않는다. 밥·면·빵 같은 탄수화물 주식도 목록에 없으면 사용하지 않는다. ' +
      '(2) 물, 소금, 후추, 식용유, 참기름, 간장, 설탕, 고춧가루, 다진 마늘 같은 기본 양념·조미료는 목록에 없어도 사용해도 된다. ' +
      '(3) 20분 내외로 냄비·프라이팬으로 만들 수 있는 간단한 요리를 우선한다. (4) 모든 내용은 한국어로 작성한다. ' +
      '(5) 재료 옆에 (유통기한 YYYY-MM-DD)가 표시된 경우, 유통기한이 임박한 재료를 우선적으로 소비하는 레시피를 제안한다. ' +
      '(6) 예상 조리시간(cook_time)과 난이도(difficulty: 쉬움/보통/어려움 중 하나)도 함께 제시한다.';
    const userPrompt =
      `냉장고에 있는 재료: ${ingredientList}\n` +
      (modeGuide ? `요청 옵션: ${mode} — ${modeGuide}\n` : '') +
      '이 재료들로 만들 수 있는 레시피 1개를 제안해줘.';

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '요리명' },
              ingredients: { type: 'string', description: '재료 목록(줄바꿈 구분, 양념은 (양념) 표시)' },
              steps: { type: 'string', description: '조리법(번호 매긴 단계, 줄바꿈 구분)' },
              cook_time: { type: 'string', description: '예상 조리시간 (예: "약 15분")' },
              difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'], description: '난이도' },
            },
            required: ['title', 'ingredients', 'steps', 'cook_time', 'difficulty'],
          },
        },
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Gemini 오류:', apiRes.status, errText);
      return res.status(502).json({ error: 'AI 레시피 생성에 실패했습니다.' });
    }

    const data = await apiRes.json();
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p && p.text).filter(Boolean).join('') || '';
    let recipe;
    try {
      recipe = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: 'AI 응답을 해석하지 못했습니다.' });
    }
    const title = (recipe.title || '').toString().trim();
    if (!title) {
      return res.status(502).json({ error: 'AI가 유효한 레시피를 만들지 못했습니다.' });
    }

    // 3) recipes 테이블에 저장 후 반환 (다른 레시피와 동일 형식)
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps, cook_time, difficulty) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, ingredients, steps, cook_time, difficulty, created_at',
      [
        title,
        (recipe.ingredients ?? '').toString(),
        (recipe.steps ?? '').toString(),
        (recipe.cook_time ?? '').toString().trim() || null,
        (recipe.difficulty ?? '').toString().trim() || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '레시피 자동생성 중 오류가 발생했습니다.' });
  }
});

// 삭제
app.delete('/api/recipes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM recipes WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '해당 레시피를 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '레시피를 삭제하지 못했습니다.' });
  }
});

// ------------------------------------------------------------
// 서버 시작 (로컬) / Vercel 서버리스 export (듀얼모드)
// ------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
