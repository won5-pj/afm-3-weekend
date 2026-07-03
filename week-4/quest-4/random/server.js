// ============================================================
// 밸런스 게임 (양자택일 투표) - 백엔드 서버
// Express + PostgreSQL(Supabase)
// 질문 등록(A vs B) → DB 저장 → 목록 조회 → 투표 → DB UPDATE(표 +1) → 퍼센티지 반영
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

// 밸런스 질문 자동생성(AI)용 Google Gemini 키 (없으면 /api/questions/generate 만 비활성)
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';

// ------------------------------------------------------------
// DB 초기화 (lazy init: 중복 실행 방지)
// ------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_questions (
      id SERIAL PRIMARY KEY,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      votes_a INTEGER NOT NULL DEFAULT 0,
      votes_b INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // 게시물(질문)별 익명 리플(댓글) — 질문 삭제 시 함께 삭제(CASCADE)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_comments (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES balance_questions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_balance_comments_qid ON balance_comments(question_id);');
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
// 밸런스 게임(balance_questions) API
// ------------------------------------------------------------

// 전체 목록 (최신순) — 총 참여자 수(votes_a + votes_b)도 함께 반환
app.get('/api/questions', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.id, q.option_a, q.option_b, q.votes_a, q.votes_b, (q.votes_a + q.votes_b) AS total,
              (SELECT COUNT(*)::int FROM balance_comments c WHERE c.question_id = q.id) AS comment_count,
              q.created_at
       FROM balance_questions q ORDER BY q.created_at DESC, q.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '질문 목록을 불러오지 못했습니다.' });
  }
});

// 질문 등록 (A vs B) → DB 저장
app.post('/api/questions', async (req, res) => {
  const { option_a, option_b } = req.body || {};
  const a = (option_a ?? '').toString().trim();
  const b = (option_b ?? '').toString().trim();
  if (!a || !b) {
    return res.status(400).json({ error: '두 개의 선택지를 모두 입력해주세요.' });
  }
  if (a.length > 200 || b.length > 200) {
    return res.status(400).json({ error: '각 선택지는 200자 이내로 입력해주세요.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO balance_questions (option_a, option_b) VALUES ($1, $2)
       RETURNING id, option_a, option_b, votes_a, votes_b, (votes_a + votes_b) AS total, created_at`,
      [a, b]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '질문을 저장하지 못했습니다.' });
  }
});

// 자동생성 — AI가 재미있는 밸런스 딜레마(A vs B)를 만들어 저장
app.post('/api/questions/generate', async (_req, res) => {
  if (!GEMINI_API_KEY) {
    return res
      .status(503)
      .json({ error: 'GEMINI_API_KEY가 설정되지 않아 자동생성을 사용할 수 없습니다. (.env 확인)' });
  }
  try {
    const systemPrompt =
      '너는 한국어 밸런스 게임(양자택일) 질문을 만드는 도우미다. ' +
      '둘 중 하나만 골라야 하는, 고민되고 재미있는 딜레마 1개를 만든다. ' +
      '규칙: (1) 두 선택지는 서로 상반되거나 팽팽하게 대립해서 고르기 어려워야 한다. ' +
      '(2) 각 선택지는 한 문장(40자 이내)으로 간결하게. (3) 자극적/혐오/정치·종교 논쟁은 피하고 일상·연애·직장·돈·음식 등 가벼운 주제로. ' +
      '(4) 모든 내용은 한국어로 작성한다.';
    const userPrompt = '새로운 밸런스 게임 딜레마 1개를 만들어줘. 매번 다른 주제로.';

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 1.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              option_a: { type: 'string', description: '선택지 A (40자 이내)' },
              option_b: { type: 'string', description: '선택지 B (40자 이내)' },
            },
            required: ['option_a', 'option_b'],
          },
        },
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Gemini 오류:', apiRes.status, errText);
      return res.status(502).json({ error: 'AI 질문 생성에 실패했습니다.' });
    }

    const data = await apiRes.json();
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p && p.text).filter(Boolean).join('') || '';
    let gen;
    try {
      gen = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: 'AI 응답을 해석하지 못했습니다.' });
    }
    const a = (gen.option_a || '').toString().trim().slice(0, 200);
    const b = (gen.option_b || '').toString().trim().slice(0, 200);
    if (!a || !b) {
      return res.status(502).json({ error: 'AI가 유효한 질문을 만들지 못했습니다.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO balance_questions (option_a, option_b) VALUES ($1, $2)
       RETURNING id, option_a, option_b, votes_a, votes_b, (votes_a + votes_b) AS total, 0 AS comment_count, created_at`,
      [a, b]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '질문 자동생성 중 오류가 발생했습니다.' });
  }
});

// 투표 → DB UPDATE (선택한 쪽 표 +1)
app.post('/api/questions/:id/vote', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  const choice = (req.body?.choice ?? '').toString().trim();
  // 컬럼명은 파라미터화 불가 → 화이트리스트로만 결정 (SQL 인젝션 방지)
  const col = choice === 'a' ? 'votes_a' : choice === 'b' ? 'votes_b' : null;
  if (!col) {
    return res.status(400).json({ error: "choice 는 'a' 또는 'b' 여야 합니다." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE balance_questions SET ${col} = ${col} + 1 WHERE id = $1
       RETURNING id, option_a, option_b, votes_a, votes_b, (votes_a + votes_b) AS total, created_at`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '해당 질문을 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '투표 처리 중 오류가 발생했습니다.' });
  }
});

// ------------------------------------------------------------
// 익명 리플(balance_comments) API
// ------------------------------------------------------------

// 특정 질문의 댓글 목록 (오래된 순)
app.get('/api/questions/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, question_id, content, likes, created_at FROM balance_comments WHERE question_id = $1 ORDER BY created_at ASC, id ASC',
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '댓글을 불러오지 못했습니다.' });
  }
});

// 익명 댓글 작성
app.post('/api/questions/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  const content = (req.body?.content ?? '').toString().trim();
  if (!content) {
    return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
  }
  if (content.length > 300) {
    return res.status(400).json({ error: '댓글은 300자 이내로 입력해주세요.' });
  }
  try {
    // 질문 존재 확인
    const q = await pool.query('SELECT 1 FROM balance_questions WHERE id = $1', [id]);
    if (q.rowCount === 0) {
      return res.status(404).json({ error: '해당 질문을 찾을 수 없습니다.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO balance_comments (question_id, content) VALUES ($1, $2) RETURNING id, question_id, content, likes, created_at',
      [id, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '댓글을 저장하지 못했습니다.' });
  }
});

// 댓글 공감(+1) → DB UPDATE
app.post('/api/comments/:id/like', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE balance_comments SET likes = likes + 1 WHERE id = $1 RETURNING id, question_id, content, likes, created_at',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '해당 댓글을 찾을 수 없습니다.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '공감 처리 중 오류가 발생했습니다.' });
  }
});

// 댓글 삭제
app.delete('/api/comments/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM balance_comments WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '해당 댓글을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '댓글을 삭제하지 못했습니다.' });
  }
});

// 삭제 (선택 기능)
app.delete('/api/questions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: '유효하지 않은 id 입니다.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM balance_questions WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: '해당 질문을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '질문을 삭제하지 못했습니다.' });
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
