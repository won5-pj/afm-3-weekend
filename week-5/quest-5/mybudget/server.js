// 가계부 앱 서버 (Node 내장 http + Supabase Postgres)
//
// 아키텍처:
//   [사용자 입력 (금액, 카테고리, 메모)]
//        → [Server]  (이 파일)
//        → DB 에 수입/지출 저장 (budget_entries 테이블)
//        → 내역 조회 & 카테고리별 합계 계산 (SQL GROUP BY)
//        → 결과 응답 (JSON)
//
// 저장: Supabase Postgres. pooler(transaction mode, 6543) 이므로 prepared statement 비활성화 필수.
//   - 드라이버: postgres (porsager) — `prepare: false`
//   - 정적 파일(index.html)은 Node 내장 http 로 직접 서빙

const http = require('http');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// 연결 문자열 (env 로 덮어쓸 수 있게 하되, 제공된 URL 을 기본값으로)
// --- .env 로더 (무의존성): .env 의 DATABASE_URL 등을 process.env 로 로드 ---
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8')
    .split(/\r?\n/).forEach((l) => {
      const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
} catch (e) {}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 필요합니다. .env 파일에 설정하세요.');

// pgbouncer transaction mode 호환 설정
const sql = postgres(DATABASE_URL, {
  prepare: false, // ★ transaction pooler 에서는 prepared statement 사용 불가
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// 허용 카테고리 (참고용 — 서버는 자유 입력도 허용하되 UI 는 아래 목록을 제공)
const CATEGORIES = {
  expense: ['식비', '교통', '주거', '구독료', '경조사', '의료', '쇼핑', '여가', '기타'],
  income: ['급여', '용돈', '부수입', '금융소득', '기타'],
};

// ---------------------------------------------------------------------------
// DB 초기화: 테이블 생성 (+ 비어 있으면 예시 데이터 시드)
// ---------------------------------------------------------------------------
const SEED_ENTRIES = [
  { type: 'income', category: '급여', amount: 3200000, memo: '7월 월급', date: '2026-07-05' },
  { type: 'income', category: '부수입', amount: 150000, memo: '중고거래 판매', date: '2026-07-07' },
  { type: 'expense', category: '주거', amount: 700000, memo: '월세', date: '2026-07-01' },
  { type: 'expense', category: '교통', amount: 55000, memo: '교통카드 충전', date: '2026-07-02' },
  { type: 'expense', category: '식비', amount: 12000, memo: '점심 김치찌개', date: '2026-07-03' },
  { type: 'expense', category: '구독료', amount: 13500, memo: '넷플릭스', date: '2026-07-04' },
  { type: 'expense', category: '식비', amount: 28000, memo: '주말 장보기', date: '2026-07-06' },
  { type: 'expense', category: '경조사', amount: 100000, memo: '동료 결혼식 축의금', date: '2026-07-08' },
  { type: 'expense', category: '여가', amount: 32000, memo: '영화·팝콘', date: '2026-07-09' },
  { type: 'expense', category: '구독료', amount: 10900, memo: '유튜브 프리미엄', date: '2026-07-04' },
  { type: 'expense', category: '식비', amount: 18500, memo: '동네 카페', date: '2026-07-10' },
  { type: 'expense', category: '의료', amount: 8000, memo: '감기약·병원', date: '2026-07-09' },
];

// 월 예산 시드 ('__total__' = 전체 예산, 나머지는 카테고리별) — budgets 가 비어 있을 때만 삽입
const SEED_BUDGETS = [
  { category: '__total__', amount: 1500000 },
  { category: '식비', amount: 300000 },
  { category: '교통', amount: 80000 },
  { category: '주거', amount: 700000 },
  { category: '구독료', amount: 30000 },
  { category: '경조사', amount: 100000 },
  { category: '여가', amount: 100000 },
  { category: '의료', amount: 50000 },
  { category: '쇼핑', amount: 100000 },
];

async function initDb() {
  await sql`
    create table if not exists budget_entries (
      id         bigint generated always as identity primary key,
      type       text not null check (type in ('income', 'expense')),
      category   text not null,
      amount     numeric(14, 2) not null check (amount >= 0),
      memo       text,
      date       date not null default current_date,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_budget_entries_date on budget_entries (date desc)`;
  await sql`create index if not exists idx_budget_entries_type on budget_entries (type)`;

  const [{ count }] = await sql`select count(*)::int as count from budget_entries`;
  if (count === 0) {
    for (const e of SEED_ENTRIES) {
      await sql`
        insert into budget_entries ${sql(e, 'type', 'category', 'amount', 'memo', 'date')}
      `;
    }
    console.log(`시드 데이터 ${SEED_ENTRIES.length}건을 삽입했습니다.`);
  }

  // 예산 테이블 (월별 예산 — 매월 반복 적용). category = '__total__' 이면 전체 예산.
  await sql`
    create table if not exists budgets (
      category   text primary key,
      amount     numeric(14, 2) not null check (amount >= 0)
    )
  `;
  const [{ count: bcount }] = await sql`select count(*)::int as count from budgets`;
  if (bcount === 0) {
    for (const b of SEED_BUDGETS) {
      await sql`insert into budgets ${sql(b, 'category', 'amount')}`;
    }
    console.log(`예산 시드 ${SEED_BUDGETS.length}건을 삽입했습니다.`);
  }
}

// ---------------------------------------------------------------------------
// 데이터 접근
// ---------------------------------------------------------------------------

// 내역 목록 조회 (month = 'YYYY-MM' 이면 해당 월만, type 이면 수입/지출만)
async function listEntries({ month, type }) {
  const conditions = [];
  if (month) conditions.push(sql`to_char(date, 'YYYY-MM') = ${month}`);
  if (type === 'income' || type === 'expense') conditions.push(sql`type = ${type}`);

  let where = sql``;
  if (conditions.length === 1) where = sql`where ${conditions[0]}`;
  else if (conditions.length === 2) where = sql`where ${conditions[0]} and ${conditions[1]}`;

  const rows = await sql`
    select id, type, category, amount::float8 as amount, memo,
           to_char(date, 'YYYY-MM-DD') as date
    from budget_entries
    ${where}
    order by date desc, id desc
  `;
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

// 단건 등록
async function createEntry({ type, category, amount, memo, date }) {
  const row = {
    type,
    category,
    amount,
    memo: memo || null,
    date: date || undefined, // undefined 이면 컬럼 default(current_date) 사용
  };
  const cols = date ? ['type', 'category', 'amount', 'memo', 'date'] : ['type', 'category', 'amount', 'memo'];
  const [created] = await sql`
    insert into budget_entries ${sql(row, ...cols)}
    returning id, type, category, amount::float8 as amount, memo, to_char(date, 'YYYY-MM-DD') as date
  `;
  return { ...created, id: Number(created.id) };
}

// 단건 삭제
async function deleteEntry(id) {
  const [row] = await sql`delete from budget_entries where id = ${id} returning id`;
  return !!row;
}

// 카테고리별 합계 (핵심: SQL GROUP BY)
async function getSummary({ month }) {
  const where = month ? sql`where to_char(date, 'YYYY-MM') = ${month}` : sql``;

  // 타입별 총합 (수입/지출 각각의 합계)
  const totalRows = await sql`
    select type, sum(amount)::float8 as total
    from budget_entries
    ${where}
    group by type
  `;
  const totals = { income: 0, expense: 0, balance: 0 };
  for (const r of totalRows) totals[r.type] = r.total;
  totals.balance = totals.income - totals.expense;

  // 타입 × 카테고리별 합계 (GROUP BY type, category)
  const byCategory = await sql`
    select type, category, sum(amount)::float8 as total, count(*)::int as count
    from budget_entries
    ${where}
    group by type, category
    order by type asc, total desc
  `;

  return { totals, byCategory };
}

// 월별 수입/지출 추이 (최근 N개월) — GROUP BY 월
async function getMonthly(months) {
  const rows = await sql`
    select to_char(date, 'YYYY-MM') as month,
           coalesce(sum(amount) filter (where type = 'expense'), 0)::float8 as expense,
           coalesce(sum(amount) filter (where type = 'income'), 0)::float8 as income
    from budget_entries
    group by month
    order by month desc
    limit ${months}
  `;
  return rows.reverse(); // 과거 → 최신 순으로 (차트 표시용)
}

// 예산 조회 ({ total, categories: { 식비: 300000, ... } })
async function getBudgets() {
  const rows = await sql`select category, amount::float8 as amount from budgets`;
  const out = { total: null, categories: {} };
  for (const r of rows) {
    if (r.category === '__total__') out.total = r.amount;
    else out.categories[r.category] = r.amount;
  }
  return out;
}

// 예산 설정/수정 (amount 가 0 이하이면 삭제)
async function setBudget(category, amount) {
  if (!amount || amount <= 0) {
    await sql`delete from budgets where category = ${category}`;
    return { category, amount: 0 };
  }
  await sql`
    insert into budgets ${sql({ category, amount }, 'category', 'amount')}
    on conflict (category) do update set amount = excluded.amount
  `;
  return { category, amount };
}

// ---------------------------------------------------------------------------
// 헬퍼: 응답 / 본문 파싱
// ---------------------------------------------------------------------------
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('잘못된 JSON 본문입니다.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 정적 파일 서빙
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(res, fileName) {
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // --- GET /api/categories  (UI 용 카테고리 목록) ---
    if (method === 'GET' && pathname === '/api/categories') {
      return sendJson(res, 200, CATEGORIES);
    }

    // --- GET /api/summary  (카테고리별 합계 / GROUP BY) ---
    if (method === 'GET' && pathname === '/api/summary') {
      const month = url.searchParams.get('month') || null;
      const summary = await getSummary({ month });
      return sendJson(res, 200, summary);
    }

    // --- GET /api/monthly  (월별 수입/지출 추이) ---
    if (method === 'GET' && pathname === '/api/monthly') {
      const raw = parseInt(url.searchParams.get('months') || '6', 10);
      const months = Math.min(Math.max(Number.isFinite(raw) ? raw : 6, 1), 24);
      return sendJson(res, 200, await getMonthly(months));
    }

    // --- GET /api/budget  (예산 조회) ---
    if (method === 'GET' && pathname === '/api/budget') {
      return sendJson(res, 200, await getBudgets());
    }

    // --- PUT /api/budget  (예산 설정 {category, amount}) ---
    if (method === 'PUT' && pathname === '/api/budget') {
      const body = await readJsonBody(req);
      const category = (body.category || '').trim();
      const amount = Number(body.amount);
      if (!category) return sendJson(res, 400, { error: '카테고리가 필요합니다.' });
      if (!Number.isFinite(amount) || amount < 0) {
        return sendJson(res, 400, { error: '예산은 0 이상의 숫자여야 합니다.' });
      }
      const saved = await setBudget(category, amount);
      return sendJson(res, 200, saved);
    }

    // --- POST /api/transactions  (내역 등록) ---
    if (method === 'POST' && pathname === '/api/transactions') {
      const body = await readJsonBody(req);
      const type = body.type;
      const category = (body.category || '').trim();
      const amount = Number(body.amount);
      const memo = typeof body.memo === 'string' ? body.memo.trim() : '';
      const date = (body.date || '').trim(); // 'YYYY-MM-DD' 또는 ''

      if (type !== 'income' && type !== 'expense') {
        return sendJson(res, 400, { error: 'type 은 income(수입) 또는 expense(지출) 여야 합니다.' });
      }
      if (!category) return sendJson(res, 400, { error: '카테고리를 입력해주세요.' });
      if (!Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 400, { error: '금액은 0보다 큰 숫자여야 합니다.' });
      }
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' });
      }

      const created = await createEntry({ type, category, amount, memo, date });
      return sendJson(res, 201, created);
    }

    // --- GET /api/transactions  (내역 목록 조회) ---
    if (method === 'GET' && pathname === '/api/transactions') {
      const month = url.searchParams.get('month') || null;
      const type = url.searchParams.get('type') || null;
      const entries = await listEntries({ month, type });
      return sendJson(res, 200, entries);
    }

    // --- DELETE /api/transactions/:id  (내역 삭제) ---
    const delMatch = pathname.match(/^\/api\/transactions\/(\d+)$/);
    if (method === 'DELETE' && delMatch) {
      const id = parseInt(delMatch[1], 10);
      const ok = await deleteEntry(id);
      if (!ok) return sendJson(res, 404, { error: `id=${id} 내역을 찾을 수 없습니다.` });
      return sendJson(res, 200, { ok: true, id });
    }

    // --- 정적: / 또는 /index.html ---
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return serveStatic(res, 'index.html');
    }

    // --- 기타 정적 파일 (디렉터리 탈출 방지) ---
    if (method === 'GET') {
      const safeName = path.basename(pathname);
      if (safeName && safeName !== '/' && fs.existsSync(path.join(ROOT, safeName))) {
        return serveStatic(res, safeName);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error(`${method} ${pathname} 처리 실패:`, err.message);
    if (!res.headersSent) sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

// DB 초기화 후 서버 시작
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`가계부 앱 서버 실행 중: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패 — 서버를 시작하지 못했습니다:', err);
    process.exit(1);
  });
