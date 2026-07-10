// ============================================================
// 냉장고 재료 + 레시피 관리 앱 - 백엔드 서버
// Express + PostgreSQL(Supabase)
// ============================================================

require('dotenv').config();

const express = require('express');
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

// ------------------------------------------------------------
// Gemini API (레시피 AI 생성)
// ------------------------------------------------------------
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';

const RECIPE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ingredients: { type: 'string' },
    steps: { type: 'string' },
    cook_time: { type: 'string' },
    difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
  },
  required: ['title', 'ingredients', 'steps', 'cook_time', 'difficulty'],
};

async function generateRecipeWithGemini(ingredientNames) {
  if (!GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다. (.env 확인)');
    err.status = 500;
    throw err;
  }

  const prompt = [
    '너는 자취생을 위한 냉장고 재료 활용 요리 전문가야.',
    '아래 냉장고 재료 중 일부 또는 전부를 활용한 간단한 집밥 레시피 1개를 만들어줘.',
    '재료를 모두 쓸 필요는 없고, 실제로 잘 어울리는 조합만 골라서 사용해.',
    '',
    `냉장고 재료: ${ingredientNames.join(', ')}`,
    '',
    'ingredients 필드는 사용할 재료와 분량을 줄바꿈으로, steps 필드는 조리 순서를 "1. ..." 형식으로 줄바꿈으로 작성해줘.',
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('Gemini API 오류:', res.status, errBody);
    const err = new Error(`Gemini API 요청이 실패했습니다. (HTTP ${res.status})`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Gemini 응답에서 레시피를 읽지 못했습니다.');
    err.status = 502;
    throw err;
  }

  let recipe;
  try {
    recipe = JSON.parse(text);
  } catch (e) {
    console.error('Gemini 응답 JSON 파싱 실패:', text);
    const err = new Error('Gemini 응답을 해석하지 못했습니다.');
    err.status = 502;
    throw err;
  }

  return recipe;
}

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

// AI(Gemini) 레시피 제안 — 냉장고 재료를 바탕으로 초안 생성 (저장은 별도로 /api/recipes 호출 필요)
app.post('/api/recipes/ai-suggest', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT name FROM ingredients ORDER BY created_at DESC, id DESC');
    const ingredientNames = rows.map((r) => r.name).filter(Boolean);
    if (ingredientNames.length === 0) {
      return res.status(400).json({ error: '냉장고에 재료가 없어요. 먼저 재료를 추가해 주세요.' });
    }
    const recipe = await generateRecipeWithGemini(ingredientNames);
    res.json(recipe);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'AI 레시피 생성에 실패했습니다.' });
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
  initDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('DB 초기화 실패:', err);
      process.exit(1);
    });
}

module.exports = app;
