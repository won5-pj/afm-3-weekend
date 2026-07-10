// Shared helpers for the 멍스데이 카페 대시보드 serverless functions.
// Files prefixed with "_" are NOT treated as routes by Vercel.
const { Pool } = require('pg');
const crypto = require('crypto');

// ---------- Auth (server-side, HMAC token) ----------
// 사장님만 접근. /api/login 이 자격 확인 후 서명 토큰을 발급하고,
// 데이터 엔드포인트는 checkAuth 로 Bearer 토큰을 검증한다.
const AUTH_SECRET = process.env.AUTH_SECRET || 'mongsday-dev-secret-change-me';
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW || '123456';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function signToken(id) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${id}.${exp}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [p, sig] = token.split('.');
  if (!p || !sig) return false;
  let payload;
  try { payload = Buffer.from(p, 'base64url').toString(); } catch { return false; }
  const expect = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(payload.split('.')[1]);
  return !!exp && Date.now() <= exp;
}

function checkAuth(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return verifyToken(token);
}

// credential check → returns a signed token or null
function login(id, pw) {
  return String(id) === ADMIN_ID && String(pw) === ADMIN_PW ? signToken(ADMIN_ID) : null;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Reuse one pool across warm invocations. Uses the Supabase transaction pooler
// (port 6543), so we keep queries to plain text (no prepared statements) and a
// small pool to stay friendly to pgBouncer.
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
  }
  return pool;
}

// A café-owner-friendly currency: 380000 -> "38만원"
function toManwon(n) {
  const won = Number(n) || 0;
  const man = won / 10000;
  if (man >= 100) return `${(man / 100).toFixed(man % 100 === 0 ? 0 : 1)}백만원`;
  if (Number.isInteger(man)) return `${man}만원`;
  return `${man.toFixed(1)}만원`;
}

function pct(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10; // one decimal
}

// Pull every aggregate the dashboard needs, anchored to the latest sale date in
// the data so "어제 / 이번 주" always reflect the most recent real numbers.
async function getCafeData() {
  const db = getPool();
  const q = (text) => db.query(text).then((r) => r.rows);

  const [{ anchor }] = (await q(`select max(sale_date)::text as anchor from cafe_sales`));
  const A = `'${anchor}'::date`;

  const [
    daily,
    week,
    prevWeek,
    top,
    mix,
    inventory,
    reservations,
    birthdays,
    pets,
    month,
  ] = await Promise.all([
    // yesterday(anchor) + the day before, for the headline number
    q(`select
         (select coalesce(sum(amount),0) from cafe_sales where sale_date = ${A})::bigint as amt,
         (select count(distinct order_no) from cafe_sales where sale_date = ${A})::int as orders,
         (select coalesce(sum(amount),0) from cafe_sales where sale_date = ${A} - 1)::bigint as prev`),
    // this ISO week Mon..Sun
    q(`select to_char(d,'YYYY-MM-DD') as date,
              extract(isodow from d)::int as dow,
              coalesce((select sum(amount) from cafe_sales s where s.sale_date = d::date),0)::bigint as amount,
              (d::date > ${A}) as future
       from generate_series(date_trunc('week', ${A}), date_trunc('week', ${A}) + interval '6 day', interval '1 day') d
       order by d`),
    // same-span previous week (Mon..anchor) for WoW
    q(`select
         (select coalesce(sum(amount),0) from cafe_sales
            where sale_date between date_trunc('week',${A})::date and ${A})::bigint as this_span,
         (select coalesce(sum(amount),0) from cafe_sales
            where sale_date between date_trunc('week',${A})::date - 7 and ${A} - 7)::bigint as prev_span`),
    // popular menus, last 7 days
    q(`select item_name as name, category, sum(qty)::int as qty, sum(amount)::bigint as amount
       from cafe_sales where sale_date between ${A} - 6 and ${A}
       group by item_name, category order by qty desc, amount desc limit 6`),
    // category revenue mix, last 7 days
    q(`select category, sum(amount)::bigint as amount, sum(qty)::int as qty
       from cafe_sales where sale_date between ${A} - 6 and ${A}
       group by category order by amount desc`),
    // inventory with low / expiring flags
    q(`select name, category, stock_qty::float as stock, unit, reorder_level::float as reorder,
              to_char(expiry_date,'YYYY-MM-DD') as expiry,
              (stock_qty <= reorder_level) as low,
              (expiry_date is not null and expiry_date <= ${A} + 4) as expiring
       from cafe_inventory order by low desc, expiry_date nulls last`),
    // upcoming birthday-party reservations
    q(`select to_char(reserve_date,'YYYY-MM-DD') as date, pet_name, package_name,
              headcount, amount::bigint as amount, status, memo,
              (reserve_date - ${A})::int as days_until
       from cafe_reservations where reserve_date >= ${A}
       order by reserve_date limit 6`),
    // dogs with birthdays coming up (year-agnostic)
    q(`select pet_name, breed, owner_name, to_char(birthday,'YYYY-MM-DD') as birthday,
              (case
                 when to_date(to_char(${A},'YYYY')||to_char(birthday,'MMDD'),'YYYYMMDD') >= ${A}
                 then to_date(to_char(${A},'YYYY')||to_char(birthday,'MMDD'),'YYYYMMDD')
                 else to_date((extract(year from ${A})+1)::text||to_char(birthday,'MMDD'),'YYYYMMDD')
               end - ${A})::int as days_until
       from cafe_pets order by days_until asc`),
    // membership snapshot
    q(`select count(*)::int as total,
              coalesce(sum(visits),0)::int as total_visits from cafe_pets`),
    // this month revenue
    q(`select coalesce(sum(amount),0)::bigint as amt from cafe_sales
       where date_trunc('month',sale_date) = date_trunc('month',${A})`),
  ]);

  const d = daily[0];
  const wow = prevWeek[0];
  const dowNames = ['월', '화', '수', '목', '금', '토', '일'];

  const lowStock = inventory.filter((i) => i.low);
  const expiring = inventory.filter((i) => i.expiring);

  return {
    anchor,
    yesterday: {
      date: anchor,
      amount: Number(d.amt),
      amountLabel: toManwon(d.amt),
      orders: d.orders,
      prev: Number(d.prev),
      changePct: pct(Number(d.amt), Number(d.prev)),
    },
    week: week.map((w) => ({
      date: w.date,
      label: dowNames[w.dow - 1],
      amount: Number(w.amount),
      amountLabel: w.future ? '-' : toManwon(w.amount),
      future: w.future,
    })),
    weekTotal: Number(wow.this_span),
    weekTotalLabel: toManwon(wow.this_span),
    weekChangePct: pct(Number(wow.this_span), Number(wow.prev_span)),
    monthRevenue: Number(month[0].amt),
    monthRevenueLabel: toManwon(month[0].amt),
    topMenus: top.map((t, i) => ({
      rank: i + 1,
      name: t.name,
      category: t.category,
      qty: t.qty,
      amount: Number(t.amount),
    })),
    categoryMix: mix.map((m) => ({
      category: m.category,
      amount: Number(m.amount),
      qty: m.qty,
    })),
    inventory: {
      lowStock: lowStock.map((i) => ({ ...i })),
      expiring: expiring.map((i) => ({ ...i })),
      totalItems: inventory.length,
    },
    reservations,
    birthdays: birthdays.filter((b) => b.days_until <= 30),
    pets: pets[0],
  };
}

// OpenWeatherMap for 인천 청라국제도시 (호수공원 인근).
const CHEONGNA = { lat: 37.5334, lon: 126.6419 };
async function getWeather() {
  const key = process.env.WEATHER_API_KEY;
  const base = 'https://api.openweathermap.org/data/2.5';
  const common = `lat=${CHEONGNA.lat}&lon=${CHEONGNA.lon}&appid=${key}&units=metric&lang=kr`;

  const [curRes, fcRes] = await Promise.all([
    fetch(`${base}/weather?${common}`),
    fetch(`${base}/forecast?${common}&cnt=8`),
  ]);
  if (!curRes.ok) throw new Error(`weather ${curRes.status}`);
  const cur = await curRes.json();
  const fc = fcRes.ok ? await fcRes.json() : { list: [] };

  const w0 = (cur.weather && cur.weather[0]) || {};
  const main = (w0.main || '').toLowerCase();

  // Max rain probability over the next ~24h
  let popMax = 0;
  let willRain = false;
  for (const item of fc.list || []) {
    if (typeof item.pop === 'number') popMax = Math.max(popMax, item.pop);
    const m = ((item.weather && item.weather[0] && item.weather[0].main) || '').toLowerCase();
    if (m.includes('rain') || m.includes('snow') || m.includes('thunder')) willRain = true;
  }

  const isWeekend = [0, 6].includes(new Date().getDay());
  const bad = ['rain', 'snow', 'thunderstorm', 'drizzle'].includes(main) || popMax >= 0.5 || willRain;
  const nice = ['clear', 'clouds'].includes(main) && popMax < 0.3;

  let prediction;
  if (bad) {
    prediction = {
      level: 'down',
      label: '손님 감소 예상',
      note: '비/궂은 날씨로 방문이 줄 수 있어요. 디저트·펫베이커리 할인이나 실내 포토존 이벤트를 추천해요.',
    };
  } else if (nice && isWeekend) {
    prediction = {
      level: 'up',
      label: '손님 증가 예상',
      note: '맑은 주말! 강아지 운동장·브런치 수요가 몰릴 수 있으니 인력/재고를 넉넉히 준비하세요.',
    };
  } else if (nice) {
    prediction = {
      level: 'up',
      label: '평소보다 붐빔',
      note: '날씨가 좋아 산책 겸 방문이 늘 수 있어요. 음료 재료를 여유 있게 준비하세요.',
    };
  } else {
    prediction = { level: 'flat', label: '평소 수준', note: '무난한 날씨예요. 평소대로 운영하세요.' };
  }

  return {
    city: '인천 청라',
    temp: Math.round(cur.main?.temp),
    feelsLike: Math.round(cur.main?.feels_like),
    tempMin: Math.round(cur.main?.temp_min),
    tempMax: Math.round(cur.main?.temp_max),
    humidity: cur.main?.humidity,
    windSpeed: cur.wind?.speed,
    description: w0.description || '',
    main: w0.main || '',
    icon: w0.icon || '',
    pop: Math.round(popMax * 100),
    prediction,
  };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = {
  getPool, getCafeData, getWeather, toManwon, sendJson,
  login, checkAuth, readBody,
};
