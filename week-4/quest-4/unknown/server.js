// ============================================================
// 익명 칭찬 게시판 - 백엔드 서버
// Express + PostgreSQL(Supabase)
// 글 작성(카테고리, 내용) → DB 저장 → 목록 조회 → 공감(+1) UPDATE
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
// DB 초기화 (lazy init: 중복 실행 방지)
// ------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS praises (
      id SERIAL PRIMARY KEY,
      category TEXT,
      content TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      laughs INTEGER NOT NULL DEFAULT 0,
      cries INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // 기존 테이블에도 반응 컬럼 보장 (마이그레이션)
  await pool.query('ALTER TABLE praises ADD COLUMN IF NOT EXISTS laughs INTEGER NOT NULL DEFAULT 0;');
  await pool.query('ALTER TABLE praises ADD COLUMN IF NOT EXISTS cries INTEGER NOT NULL DEFAULT 0;');
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
// 칭찬 글(praises) API
// ------------------------------------------------------------

// 전체 목록 (최신순)
app.get('/api/praises', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, category, content, likes, laughs, cries, created_at FROM praises ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '칭찬 목록을 불러오지 못했습니다.' });
  }
});

// 작성 (카테고리, 내용) → DB 저장
app.post('/api/praises', async (req, res) => {
  const { category, content } = req.body || {};
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: '칭찬 내용을 입력해주세요.' });
  }
  if (content.trim().length > 500) {
    return res.status(400).json({ error: '칭찬 내용은 500자 이내로 입력해주세요.' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO praises (category, content) VALUES ($1, $2) RETURNING id, category, content, likes, laughs, cries, created_at',
      [(category ?? '').toString().trim() || null, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '칭찬을 저장하지 못했습니다.' });
  }
});

// 반응 종류 → DB 컬럼 (화이트리스트: SQL 인젝션 방지)
const REACTIONS = { like: 'likes', laugh: 'laughs', cry: 'cries' };

// 반응(+1) → DB UPDATE (type 에 해당하는 컬럼 +1)
app.post('/api/praises/:id/react', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  const type = (req.body?.type ?? '').toString().trim();
  const col = REACTIONS[type];
  if (!col) {
    return res.status(400).json({ error: "type 은 'like', 'laugh', 'cry' 중 하나여야 합니다." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE praises SET ${col} = ${col} + 1 WHERE id = $1
       RETURNING id, category, content, likes, laughs, cries, created_at`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '해당 글을 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '반응 처리 중 오류가 발생했습니다.' });
  }
});

// 하위 호환: 기존 공감(like) 엔드포인트
app.post('/api/praises/:id/like', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE praises SET likes = likes + 1 WHERE id = $1
       RETURNING id, category, content, likes, laughs, cries, created_at`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '해당 글을 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '공감 처리 중 오류가 발생했습니다.' });
  }
});

// 삭제 (선택 기능)
app.delete('/api/praises/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM praises WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '해당 글을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '글을 삭제하지 못했습니다.' });
  }
});

// ------------------------------------------------------------
// 서버 시작
// ------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
