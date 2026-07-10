// ============================================================
// 샘플 데이터 시딩 스크립트
// 테이블이 비어있을 때만 삽입한다 (재실행해도 중복 생성되지 않음)
// 사용법: node seed.js  (또는 npm run seed)
// ============================================================

require('dotenv').config();

const { Pool } = require('pg');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 설정되지 않았습니다. (.env 확인)');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function daysFromToday(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const SAMPLE_INGREDIENTS = [
  { name: '계란', category: '냉장', expiry_date: daysFromToday(12) },
  { name: '대파', category: '냉장', expiry_date: daysFromToday(2) },
  { name: '두부', category: '냉장', expiry_date: daysFromToday(-1) },
  { name: '묵은지', category: '냉장', expiry_date: daysFromToday(30) },
  { name: '스팸', category: '실온', expiry_date: daysFromToday(180) },
  { name: '냉동만두', category: '냉동', expiry_date: daysFromToday(60) },
  { name: '우유', category: '냉장', expiry_date: daysFromToday(0) },
  { name: '양파', category: '실온', expiry_date: null },
];

const SAMPLE_RECIPES = [
  {
    title: '계란말이',
    ingredients: '계란 3개\n대파 약간\n소금 약간',
    steps: '1. 계란을 풀고 소금으로 간한다.\n2. 잘게 썬 대파를 섞는다.\n3. 팬에 얇게 부어가며 돌돌 말아 익힌다.',
    cook_time: '약 10분',
    difficulty: '쉬움',
  },
  {
    title: '묵은지 스팸 두부 찌개',
    ingredients: '묵은지 한 줌\n스팸 1/2캔\n두부 1/2모\n대파 약간',
    steps: '1. 냄비에 묵은지와 스팸을 볶는다.\n2. 물을 붓고 끓인다.\n3. 두부를 넣고 한소끔 더 끓인다.\n4. 대파를 올려 마무리한다.',
    cook_time: '약 25분',
    difficulty: '보통',
  },
  {
    title: '스팸 대파 볶음밥',
    ingredients: '밥 1공기\n스팸 1/2캔\n대파 약간\n계란 1개(선택)',
    steps: '1. 스팸을 잘게 썰어 팬에 굽는다.\n2. 대파와 밥을 넣고 함께 볶는다.\n3. 원하면 계란후라이를 올려 마무리한다.',
    cook_time: '약 15분',
    difficulty: '쉬움',
  },
];

async function main() {
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

  const { rows: ingRows } = await pool.query('SELECT COUNT(*)::int AS count FROM ingredients');
  if (ingRows[0].count === 0) {
    for (const it of SAMPLE_INGREDIENTS) {
      await pool.query(
        'INSERT INTO ingredients (name, category, expiry_date) VALUES ($1, $2, $3)',
        [it.name, it.category, it.expiry_date]
      );
    }
    console.log(`ingredients: ${SAMPLE_INGREDIENTS.length}건 삽입`);
  } else {
    console.log(`ingredients: 이미 ${ingRows[0].count}건 존재 — 건너뜀`);
  }

  const { rows: recRows } = await pool.query('SELECT COUNT(*)::int AS count FROM recipes');
  if (recRows[0].count === 0) {
    for (const r of SAMPLE_RECIPES) {
      await pool.query(
        'INSERT INTO recipes (title, ingredients, steps, cook_time, difficulty) VALUES ($1, $2, $3, $4, $5)',
        [r.title, r.ingredients, r.steps, r.cook_time, r.difficulty]
      );
    }
    console.log(`recipes: ${SAMPLE_RECIPES.length}건 삽입`);
  } else {
    console.log(`recipes: 이미 ${recRows[0].count}건 존재 — 건너뜀`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('시딩 실패:', err);
  process.exit(1);
});
