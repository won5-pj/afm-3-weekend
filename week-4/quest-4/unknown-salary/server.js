// ============================================================
// 익명 연봉/지출 비교 - 백엔드 서버
// Express + PostgreSQL(Supabase)
//
// 구조: [익명 입력(월급/지출/직군/연차)] → [Server] → DB 저장
//        → SQL AVG()/COUNT()/GROUP BY 로 전체 평균·분포·직군별 평균 계산
//        → 내 위치(상위 %) 산출 → 결과 응답
// 금액 단위는 모두 "만원"
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// DB 연결 (Supabase 풀러, SSL 필요)
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
// DB 초기화 (lazy init)
//  salary       : 월급(만원)
//  job_category : 직군
//  exp_*        : 카테고리별 월 지출 내역(만원) — 식비/주거/교통/구독료/기타
// ------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_entries (
      id SERIAL PRIMARY KEY,
      job_category TEXT,
      years INTEGER NOT NULL DEFAULT 0,
      salary NUMERIC NOT NULL DEFAULT 0,
      exp_food NUMERIC NOT NULL DEFAULT 0,
      exp_housing NUMERIC NOT NULL DEFAULT 0,
      exp_transport NUMERIC NOT NULL DEFAULT 0,
      exp_subscription NUMERIC NOT NULL DEFAULT 0,
      exp_etc NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  dbInitialized = true;
}

// ------------------------------------------------------------
// 미들웨어
// ------------------------------------------------------------
app.use(express.json());
app.use(express.static(__dirname));

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
// 분포 구간 (만원) — width_bucket 임계값과 동일하게 유지
// ------------------------------------------------------------
const BUCKET_THRESHOLDS = [200, 300, 400, 500, 700];
const BUCKET_LABELS = ['~200', '200~300', '300~400', '400~500', '500~700', '700만원+'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
function bucketIndex(salary) {
  let i = 0;
  while (i < BUCKET_THRESHOLDS.length && salary >= BUCKET_THRESHOLDS[i]) i += 1;
  return i; // 0 ~ 5
}

// ------------------------------------------------------------
// SQL 집계로 전체 통계 계산 (AVG / COUNT / GROUP BY 활용)
// ------------------------------------------------------------
async function getStats() {
  // 1) 전체 평균/개수 — AVG(), COUNT()
  const aggRes = await pool.query(`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(AVG(salary), 0) AS avg_salary,
      COALESCE(AVG(exp_food + exp_housing + exp_transport + exp_subscription + exp_etc), 0) AS avg_expense,
      COALESCE(AVG(exp_food), 0) AS avg_food,
      COALESCE(AVG(exp_housing), 0) AS avg_housing,
      COALESCE(AVG(exp_transport), 0) AS avg_transport,
      COALESCE(AVG(exp_subscription), 0) AS avg_subscription,
      COALESCE(AVG(exp_etc), 0) AS avg_etc
    FROM salary_entries
  `);
  const a = aggRes.rows[0];

  // 2) 월급 분포 — width_bucket + GROUP BY
  const distRes = await pool.query(
    `SELECT width_bucket(salary, $1::numeric[]) AS bucket, COUNT(*)::int AS count
     FROM salary_entries GROUP BY bucket ORDER BY bucket`,
    [BUCKET_THRESHOLDS]
  );
  const distribution = BUCKET_LABELS.map((label) => ({ label, count: 0 }));
  distRes.rows.forEach((r) => {
    const idx = Math.min(num(r.bucket), distribution.length - 1);
    distribution[idx].count = num(r.count);
  });

  // 3) 직군별 평균 월급 — GROUP BY job_category
  const jobRes = await pool.query(`
    SELECT COALESCE(NULLIF(job_category, ''), '기타') AS job_category,
           COUNT(*)::int AS count,
           COALESCE(AVG(salary), 0) AS avg_salary
    FROM salary_entries
    GROUP BY COALESCE(NULLIF(job_category, ''), '기타')
    ORDER BY avg_salary DESC
  `);

  const avgSalary = num(a.avg_salary);
  const avgExpense = num(a.avg_expense);
  const avgSaving = avgSalary - avgExpense;

  return {
    count: num(a.count),
    avgSalary,
    avgExpense,
    avgSaving,
    avgSavingRate: avgSalary > 0 ? (avgSaving / avgSalary) * 100 : 0,
    categoryAvg: {
      food: num(a.avg_food),
      housing: num(a.avg_housing),
      transport: num(a.avg_transport),
      subscription: num(a.avg_subscription),
      etc: num(a.avg_etc),
    },
    distribution,
    jobStats: jobRes.rows.map((r) => ({
      job_category: r.job_category,
      count: num(r.count),
      avgSalary: num(r.avg_salary),
    })),
  };
}

// ------------------------------------------------------------
// 랜덤 익명 데이터 생성 (분포/평균을 채우는 샘플)
// ------------------------------------------------------------
const JOBS = ['개발', '디자인', '기획/PM', '마케팅', '영업', '금융', '교육', '기타'];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomEntry() {
  const job = JOBS[randInt(0, JOBS.length - 1)];
  const years = randInt(0, 15);
  // 연차가 높을수록 월급이 대체로 높아지도록 약한 상관 부여 (만원)
  const salary = Math.min(900, 230 + years * randInt(8, 20) + randInt(0, 120));
  const housing = randInt(25, Math.max(35, Math.round(salary * 0.35)));
  const food = randInt(20, 75);
  const transport = randInt(5, 30);
  const subscription = randInt(1, 15);
  const etc = randInt(5, 55);
  return { job, years, salary, food, housing, transport, subscription, etc };
}

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

// 전체 통계 (평균/분포/직군별 평균/카테고리별 평균)
app.get('/api/stats', async (_req, res) => {
  try {
    res.json(await getStats());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '통계를 불러오지 못했습니다.' });
  }
});

// 익명 제출 → DB 저장 → 전체 통계 + 내 위치(상위 %) 반환
app.post('/api/entries', async (req, res) => {
  const b = req.body || {};
  const salary = num(b.salary);
  if (!(salary > 0)) {
    return res.status(400).json({ error: '월급을 0보다 큰 값으로 입력해주세요. (단위: 만원)' });
  }
  const years = Math.max(0, Math.floor(num(b.years)));
  const jobCategory = (b.job_category ?? b.job ?? '').toString().trim() || null;
  const food = Math.max(0, num(b.food));
  const housing = Math.max(0, num(b.housing));
  const transport = Math.max(0, num(b.transport));
  const subscription = Math.max(0, num(b.subscription));
  const etc = Math.max(0, num(b.etc));

  try {
    const { rows: inserted } = await pool.query(
      `INSERT INTO salary_entries (job_category, years, salary, exp_food, exp_housing, exp_transport, exp_subscription, exp_etc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, job_category, years, salary, exp_food, exp_housing, exp_transport, exp_subscription, exp_etc, created_at`,
      [jobCategory, years, salary, food, housing, transport, subscription, etc]
    );
    const entry = inserted[0];

    // 내 위치(상위 %) — COUNT() FILTER 로 나 이상(나 포함) 비율 계산
    const rankRes = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE salary >= $1)::int AS ge, COUNT(*)::int AS total
       FROM salary_entries`,
      [salary]
    );
    const { ge, total } = rankRes.rows[0];
    const topPercent = num(total) > 0 ? Math.max(1, Math.round((num(ge) / num(total)) * 100)) : 100;

    const stats = await getStats();

    const myExpense = food + housing + transport + subscription + etc;
    const mySaving = salary - myExpense;

    const me = {
      salary,
      expense: myExpense,
      saving: mySaving,
      savingRate: salary > 0 ? (mySaving / salary) * 100 : 0,
      topPercent,
      bucketIndex: bucketIndex(salary),
      jobCategory: jobCategory || '기타',
      years,
      categories: { food, housing, transport, subscription, etc },
    };

    res.status(201).json({ entry, me, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '제출을 저장하지 못했습니다.' });
  }
});

// 랜덤 익명 데이터 N건 생성 → DB 저장 → 최신 통계 반환
app.post('/api/entries/random', async (req, res) => {
  const count = Math.min(20, Math.max(1, Math.floor(num(req.body?.count) || 1)));
  try {
    for (let i = 0; i < count; i++) {
      const e = randomEntry();
      await pool.query(
        `INSERT INTO salary_entries (job_category, years, salary, exp_food, exp_housing, exp_transport, exp_subscription, exp_etc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [e.job, e.years, e.salary, e.food, e.housing, e.transport, e.subscription, e.etc]
      );
    }
    res.status(201).json({ added: count, stats: await getStats() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '랜덤 데이터 생성 중 오류가 발생했습니다.' });
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
