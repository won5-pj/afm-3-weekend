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
      'SELECT id, title, ingredients, steps, created_at FROM recipes ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '레시피 목록을 불러오지 못했습니다.' });
  }
});

// 생성
app.post('/api/recipes', async (req, res) => {
  const { title, ingredients, steps } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title은 필수입니다.' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO recipes (title, ingredients, steps) VALUES ($1, $2, $3) RETURNING id, title, ingredients, steps, created_at',
      [title.trim(), ingredients ?? null, steps ?? null]
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
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
