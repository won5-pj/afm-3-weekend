// ============================================================
// 멍스데이(Mongsday) — 내 카페를 잘 아는 AI 운영 파트너앱 · 백엔드
// Express + PostgreSQL(Supabase) + Google Gemini
//
// 핵심 아이디어:
//   [AI Context = my_cafe.md 카페 아이덴티티]  +  [Supabase 실시간 운영 데이터]
//        → 사장님 질문에 "우리 카페를 아는" 파트너로 답한다.
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3200;

// ------------------------------------------------------------
// DB 연결 (Supabase 풀러, SSL)
// ------------------------------------------------------------
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. .env 를 확인하세요. (.env.example 참고)');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// AI 답변 생성용 Gemini 키 (없으면 규칙기반 요약으로 대체)
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';

// ------------------------------------------------------------
// AI Context 로딩 — my_cafe.md (카페 아이덴티티)
// ------------------------------------------------------------
const CAFE_MD_PATH = path.join(__dirname, 'my_cafe.md');
let CAFE_CONTEXT = '';
let CAFE_META = { name: '내 카페', concept: '', slogan: '' };
function loadCafeContext() {
  try {
    CAFE_CONTEXT = fs.readFileSync(CAFE_MD_PATH, 'utf8');
    const grab = (label) => {
      const m = CAFE_CONTEXT.match(new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*([^|]+?)\\s*\\|`));
      return m ? m[1].replace(/^["“]|["”]$/g, '').trim() : '';
    };
    CAFE_META = {
      name: grab('카페 이름') || '멍스데이',
      concept: grab('한 줄 컨셉') || '',
      slogan: grab('슬로건') || '',
    };
  } catch (e) {
    console.warn('my_cafe.md 를 읽지 못했습니다. AI Context 없이 동작합니다.', e.message);
    CAFE_CONTEXT = '';
  }
}
loadCafeContext();

// ------------------------------------------------------------
// DB 초기화 (lazy)
// ------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_menu (
      id SERIAL PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
      price INTEGER NOT NULL, cost INTEGER, is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_sales (
      id SERIAL PRIMARY KEY, sale_date DATE NOT NULL, order_no INTEGER NOT NULL,
      category TEXT NOT NULL, item_name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
      amount INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_pets (
      id SERIAL PRIMARY KEY, pet_name TEXT NOT NULL, breed TEXT, birthday DATE,
      owner_name TEXT, phone TEXT, visits INTEGER DEFAULT 0, last_visit DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_reservations (
      id SERIAL PRIMARY KEY, reserve_date DATE NOT NULL, pet_name TEXT,
      package_name TEXT, headcount INTEGER, amount INTEGER, status TEXT DEFAULT '확정',
      memo TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_inventory (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT,
      stock_qty NUMERIC(10,2) DEFAULT 0, unit TEXT, reorder_level NUMERIC(10,2),
      expiry_date DATE, updated_at TIMESTAMPTZ DEFAULT now()
    );`);
  dbInitialized = true;
}

// ------------------------------------------------------------
// 유틸
// ------------------------------------------------------------
const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// ------------------------------------------------------------
// 운영 데이터 조회 — 대시보드/AI 공통 스냅샷
// ------------------------------------------------------------
async function getSnapshot() {
  // 오늘
  const { rows: tr } = await pool.query(
    "SELECT to_char(current_date,'YYYY-MM-DD') AS today, extract(dow from current_date)::int AS dow"
  );
  const today = tr[0].today;
  const todayLabel = `${today} (${DOW[tr[0].dow]})`;

  // 이번 달 / 지난 달 매출
  //  - samePeriod=true 이면 "1일~오늘과 같은 일(day)까지"만 집계 → 월중 공정 비교(MTD)
  const monthAgg = async (offset, samePeriod) => {
    const dayClause = samePeriod
      ? " AND extract(day from sale_date) <= extract(day from current_date)"
      : '';
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::bigint AS revenue,
              COUNT(DISTINCT order_no) AS orders,
              COALESCE(SUM(qty),0)::bigint AS items
       FROM cafe_sales
       WHERE date_trunc('month', sale_date) = date_trunc('month', current_date - ($1||' month')::interval)${dayClause}`,
      [offset]
    );
    const r = rows[0];
    const revenue = Number(r.revenue), orders = Number(r.orders), items = Number(r.items);
    return { revenue, orders, items, aov: orders ? Math.round(revenue / orders) : 0 };
  };
  const thisMonth = await monthAgg(0);                 // 이번 달 누적(월초~오늘)
  const lastMonthSame = await monthAgg(1, true);        // 지난달 같은 기간(1일~같은 날)
  const deltaPct = lastMonthSame.revenue
    ? Math.round(((thisMonth.revenue - lastMonthSame.revenue) / lastMonthSame.revenue) * 1000) / 10
    : null;

  // 카테고리별(이번 달)
  const { rows: byCat } = await pool.query(
    `SELECT category, SUM(amount)::bigint AS revenue, SUM(qty)::bigint AS qty
     FROM cafe_sales
     WHERE date_trunc('month', sale_date) = date_trunc('month', current_date)
     GROUP BY category ORDER BY revenue DESC`
  );
  const catTotal = byCat.reduce((s, c) => s + Number(c.revenue), 0);
  const categoryBreakdown = byCat.map((c) => ({
    category: c.category,
    revenue: Number(c.revenue),
    qty: Number(c.qty),
    pct: catTotal ? Math.round((Number(c.revenue) / catTotal) * 100) : 0,
  }));

  // 인기 메뉴 TOP5 (이번 달)
  const { rows: top } = await pool.query(
    `SELECT item_name, SUM(qty)::bigint AS qty, SUM(amount)::bigint AS revenue
     FROM cafe_sales
     WHERE date_trunc('month', sale_date) = date_trunc('month', current_date)
     GROUP BY item_name ORDER BY qty DESC LIMIT 5`
  );
  const topMenu = top.map((t) => ({ name: t.item_name, qty: Number(t.qty), revenue: Number(t.revenue) }));

  // 최근 7일 매출 추이
  const { rows: trendRows } = await pool.query(
    `SELECT to_char(sale_date,'MM-DD') AS d, SUM(amount)::bigint AS revenue
     FROM cafe_sales WHERE sale_date >= current_date - interval '6 days'
     GROUP BY sale_date ORDER BY sale_date`
  );
  const trend = trendRows.map((t) => ({ d: t.d, revenue: Number(t.revenue) }));

  // 다가오는 생일파티 예약
  const { rows: upRes } = await pool.query(
    `SELECT to_char(reserve_date,'YYYY-MM-DD') AS d, (reserve_date - current_date) AS dleft,
            pet_name, package_name, headcount, amount, status
     FROM cafe_reservations
     WHERE reserve_date >= current_date AND status <> '취소'
     ORDER BY reserve_date LIMIT 10`
  );
  const upcomingReservations = upRes.map((r) => ({
    date: r.d, dleft: Number(r.dleft), pet: r.pet_name, pkg: r.package_name,
    headcount: r.headcount, amount: Number(r.amount || 0), status: r.status,
  }));

  // 이번 달 예약 실적(취소 제외)
  const { rows: resMonth } = await pool.query(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0)::bigint AS revenue
     FROM cafe_reservations
     WHERE date_trunc('month', reserve_date) = date_trunc('month', current_date) AND status <> '취소'`
  );

  // 이번 달 생일 강아지 (생일파티 마케팅 기회)
  const { rows: bdayPets } = await pool.query(
    `SELECT pet_name, breed, owner_name, extract(day from birthday)::int AS day, visits,
            date_part('year', age(current_date, birthday))::int AS age
     FROM cafe_pets
     WHERE birthday IS NOT NULL
       AND extract(month from birthday) = extract(month from current_date)
     ORDER BY extract(day from birthday)`
  );
  const birthdayPets = bdayPets.map((p) => ({
    name: p.pet_name, breed: p.breed, owner: p.owner_name, day: p.day, visits: p.visits, age: p.age,
  }));

  // 재고 경고 — 발주 필요(재고<=발주점)
  const { rows: low } = await pool.query(
    `SELECT name, category, stock_qty::float8 AS stock, unit, reorder_level::float8 AS reorder
     FROM cafe_inventory
     WHERE reorder_level IS NOT NULL AND stock_qty <= reorder_level
     ORDER BY (stock_qty / NULLIF(reorder_level,0)) ASC`
  );
  const lowStock = low.map((r) => ({ name: r.name, category: r.category, stock: r.stock, unit: r.unit, reorder: r.reorder }));

  // 재고 경고 — 유통기한 임박(7일 내)
  const { rows: exp } = await pool.query(
    `SELECT name, category, to_char(expiry_date,'YYYY-MM-DD') AS expiry,
            (expiry_date - current_date) AS dleft, stock_qty::float8 AS stock, unit
     FROM cafe_inventory
     WHERE expiry_date IS NOT NULL AND expiry_date <= current_date + interval '7 days'
     ORDER BY expiry_date`
  );
  const expiring = exp.map((r) => ({ name: r.name, expiry: r.expiry, dleft: Number(r.dleft), stock: r.stock, unit: r.unit }));

  // 단골 VIP
  const { rows: vip } = await pool.query(
    `SELECT pet_name, breed, owner_name, visits, to_char(last_visit,'YYYY-MM-DD') AS last_visit
     FROM cafe_pets ORDER BY visits DESC LIMIT 5`
  );
  const vipPets = vip.map((p) => ({ name: p.pet_name, breed: p.breed, owner: p.owner_name, visits: p.visits, last: p.last_visit }));

  const { rows: petCnt } = await pool.query('SELECT COUNT(*) AS cnt FROM cafe_pets');

  return {
    cafe: CAFE_META,
    today, todayLabel,
    month: { ...thisMonth, prevRevenue: lastMonthSame.revenue, deltaPct, comparison: '지난달 같은 기간' },
    categoryBreakdown, topMenu, trend,
    reservations: {
      upcoming: upcomingReservations,
      monthCount: Number(resMonth[0].cnt),
      monthRevenue: Number(resMonth[0].revenue),
    },
    pets: { total: Number(petCnt[0].cnt), birthdayThisMonth: birthdayPets, vip: vipPets },
    inventory: { low: lowStock, expiring, alertCount: new Set([...lowStock.map((x) => x.name), ...expiring.map((x) => x.name)]).size },
  };
}

// 스냅샷 → AI에 넘길 압축 텍스트
function snapshotToText(s) {
  const L = [];
  L.push(`[오늘] ${s.todayLabel}`);
  L.push('');
  L.push('[이번 달 매출 (월초~오늘 누적)]');
  L.push(`- 총매출: ${won(s.month.revenue)}` +
    (s.month.deltaPct !== null ? ` (지난달 같은 기간 ${won(s.month.prevRevenue)} 대비 ${s.month.deltaPct > 0 ? '+' : ''}${s.month.deltaPct}%)` : ''));
  L.push(`- 주문수: ${s.month.orders}건 · 객단가: ${won(s.month.aov)} · 판매수량: ${s.month.items}개`);
  L.push('');
  if (s.categoryBreakdown.length) {
    L.push('[카테고리별 매출(이번 달, 생일파티 예약 제외)]');
    s.categoryBreakdown.forEach((c) => L.push(`- ${c.category}: ${won(c.revenue)} (${c.pct}%, ${c.qty}개)`));
    L.push('');
  }
  if (s.topMenu.length) {
    L.push('[인기 메뉴 TOP5(이번 달, 판매수량)]');
    s.topMenu.forEach((t, i) => L.push(`${i + 1}. ${t.name} — ${t.qty}개 / ${won(t.revenue)}`));
    L.push('');
  }
  L.push('[생일파티 예약]');
  L.push(`- 이번 달 예약: ${s.reservations.monthCount}건 · 예약매출 ${won(s.reservations.monthRevenue)}`);
  if (s.reservations.upcoming.length) {
    L.push('- 다가오는 예약:');
    s.reservations.upcoming.forEach((r) =>
      L.push(`  · ${r.date}(D-${r.dleft}) ${r.pet || '-'} · ${r.pkg || '-'} · ${r.headcount || '?'}명 · ${won(r.amount)} · ${r.status}`));
  } else {
    L.push('- 다가오는 예약: 없음');
  }
  L.push('');
  L.push('[이번 달 생일 강아지 — 생일파티 세일즈 기회]');
  if (s.pets.birthdayThisMonth.length) {
    s.pets.birthdayThisMonth.forEach((p) =>
      L.push(`- ${p.name}(${p.breed}, ${p.day}일 생일, ${p.age}살, 견주 ${p.owner}, ${p.visits}회 방문)`));
  } else {
    L.push('- 이번 달 생일인 회원견 없음');
  }
  L.push('');
  L.push('[재고 경고]');
  if (s.inventory.low.length) {
    L.push('- 발주 필요(재고 부족):');
    s.inventory.low.forEach((r) => L.push(`  · ${r.name} — 현재 ${r.stock}${r.unit} (발주점 ${r.reorder}${r.unit})`));
  }
  if (s.inventory.expiring.length) {
    L.push('- 유통기한 임박(7일 내):');
    s.inventory.expiring.forEach((r) => L.push(`  · ${r.name} — D-${r.dleft} (${r.expiry}), 재고 ${r.stock}${r.unit}`));
  }
  if (!s.inventory.low.length && !s.inventory.expiring.length) L.push('- 특이사항 없음');
  L.push('');
  L.push(`[단골 회원] 총 ${s.pets.total}마리`);
  L.push(s.pets.vip.map((p) => `${p.name}(${p.visits}회)`).join(' · '));
  return L.join('\n');
}

// ------------------------------------------------------------
// 미들웨어
// ------------------------------------------------------------
app.use(express.json());
app.use(express.static(__dirname));
app.use('/api', async (_req, res, next) => {
  try { await initDB(); next(); }
  catch (err) { console.error('DB init 실패:', err); res.status(500).json({ error: 'DB 초기화 실패' }); }
});

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

// 대시보드 스냅샷 (KPI 카드 + 미니 패널)
app.get('/api/snapshot', async (_req, res) => {
  try {
    const s = await getSnapshot();
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '운영 데이터를 불러오지 못했습니다.' });
  }
});

// AI 운영 파트너 채팅
app.post('/api/chat', async (req, res) => {
  const message = (req.body?.message ?? '').toString().trim();
  if (!message) return res.status(400).json({ error: 'message 는 필수입니다.' });

  let snapshot;
  try {
    snapshot = await getSnapshot();
  } catch (err) {
    console.error('스냅샷 조회 실패:', err);
    return res.status(500).json({ error: '운영 데이터 조회에 실패했습니다.' });
  }
  const opsText = snapshotToText(snapshot);

  // Gemini 키가 없으면 규칙기반 요약으로 대체
  if (!GEMINI_API_KEY) {
    return res.json({
      reply:
        `⚠️ AI 키가 없어 원본 운영 데이터를 그대로 보여드려요.\n\n${opsText}`,
      grounded: true,
    });
  }

  const systemPrompt =
    `너는 인천 청라의 반려동물 카페 '${CAFE_META.name}'의 전속 AI 운영 파트너다. 사장님(오너)의 든든한 파트너로서 조언한다.\n` +
    `너에게는 아래 두 가지 정보만 주어진다: (1) [카페 아이덴티티] = 우리 카페가 어떤 곳인지, (2) [실시간 운영 데이터] = 방금 DB에서 조회한 실제 수치.\n` +
    `규칙:\n` +
    `- 반드시 [실시간 운영 데이터]에 있는 실제 숫자만 인용한다. 데이터에 없는 수치를 지어내지 않는다. 없으면 "데이터에 없다"고 말한다.\n` +
    `- 금액은 '1,234,000원'처럼 천단위 콤마로 읽기 쉽게.\n` +
    `- 우리 카페 컨셉(생일파티 성지, 대중적 가격, 청결 특화, 펫베이커리+브런치)에 맞는 실행 가능한 조언을 준다.\n` +
    `- 숫자 나열로 끝내지 말고, "그래서 뭘 하면 좋은지" 구체적 액션 1~2개를 제안한다.\n` +
    `- 사장님을 '사장님'이라 부르고, 친근하지만 프로페셔널하게. 이모지는 절제해서 사용.\n` +
    `- 답변은 한국어로, 간결하게(길어도 8줄 내외).`;

  const userPrompt =
    `===== [카페 아이덴티티: my_cafe.md] =====\n${CAFE_CONTEXT}\n\n` +
    `===== [실시간 운영 데이터] =====\n${opsText}\n\n` +
    `===== [사장님 질문] =====\n${message}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.6 },
      }),
    });
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Gemini 오류:', apiRes.status, errText);
      // AI 실패 시에도 데이터는 보여준다
      return res.json({ reply: `AI 응답 생성에 실패해 운영 데이터를 그대로 전달드려요.\n\n${opsText}`, grounded: true });
    }
    const data = await apiRes.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.map((p) => p && p.text).filter(Boolean).join('') || '';
    res.json({ reply: reply.trim() || '(빈 응답)', grounded: true });
  } catch (err) {
    console.error(err);
    res.json({ reply: `AI 호출 중 오류가 나서 운영 데이터를 그대로 전달드려요.\n\n${opsText}`, grounded: true });
  }
});

// 카페 컨텍스트(원본 md) 조회 — 프론트 헤더/정보용
app.get('/api/cafe', (_req, res) => {
  res.json({ meta: CAFE_META, markdown: CAFE_CONTEXT });
});

// ------------------------------------------------------------
// 서버 시작
// ------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🐶 멍스데이 AI 운영 파트너 → http://localhost:${PORT}`);
  });
}
module.exports = app;
