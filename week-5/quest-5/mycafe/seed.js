// ============================================================
// 멍스데이(Mongsday) 운영 데이터 시드 스크립트
// - cafe_* 테이블 생성(IF NOT EXISTS) 후 데모 운영 데이터를 채운다.
// - 모든 날짜는 DB의 current_date 를 기준으로 상대 계산 → "이번 달" 이 항상 살아있음.
// - cafe_* 테이블만 TRUNCATE 하므로 다른 앱 데이터에는 영향 없음.
//   실행: npm run seed   (또는 node seed.js)
// ============================================================

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL 이 없습니다. .env 를 확인하세요.');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---------- 날짜 유틸 ----------
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
function randint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function chance(p) { return Math.random() < p; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- 메뉴 정의 ----------
// [category, name, price, cost]
const MENU = [
  ['음료', '아메리카노', 4500, 1200],
  ['음료', '카페라떼', 5000, 1600],
  ['음료', '바닐라라떼', 5500, 1800],
  ['음료', '아이스티', 4500, 1000],
  ['음료', '자몽에이드', 5500, 1500],
  ['브런치', '브런치 플레이트', 12000, 5000],
  ['브런치', '리코타 샐러드', 11000, 4500],
  ['브런치', '크로크무슈', 9500, 3500],
  ['브런치', '수제 와플', 8000, 2500],
  ['펫베이커리', '강아지 수제케이크(미니)', 18000, 6000],
  ['펫베이커리', '강아지 쿠키 세트', 6000, 2000],
  ['펫베이커리', '퍼푸치노', 3500, 1000],
  ['펫베이커리', '강아지 육포', 5000, 2000],
  ['생일파티', '생일파티 베이직 패키지', 55000, 20000],
  ['생일파티', '생일파티 프리미엄 패키지', 88000, 32000],
];
// 일일 판매 생성에 쓰는 카테고리별 [name, price]
const DRINKS = MENU.filter((m) => m[0] === '음료').map((m) => [m[1], m[2]]);
const BRUNCH = MENU.filter((m) => m[0] === '브런치').map((m) => [m[1], m[2]]);
const PETBK = MENU.filter((m) => m[0] === '펫베이커리').map((m) => [m[1], m[2]]);

async function ensureTables() {
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // 세미콜론 단위로 나눠 순차 실행 (주석 라인 제거)
  const statements = ddl
    .split(';')
    .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);
  for (const stmt of statements) await pool.query(stmt);
}

async function main() {
  console.log('▶ 테이블 확인/생성...');
  await ensureTables();

  console.log('▶ 기존 cafe_* 데이터 초기화...');
  await pool.query(
    'TRUNCATE cafe_sales, cafe_reservations, cafe_pets, cafe_inventory, cafe_menu RESTART IDENTITY;'
  );

  // DB 기준 오늘 날짜 (TZ 안전하게 문자열로 받아 로컬 Date 로 구성)
  const { rows: tRows } = await pool.query("SELECT to_char(current_date,'YYYY-MM-DD') AS today");
  const [Y, M, D] = tRows[0].today.split('-').map(Number);
  const today = new Date(Y, M - 1, D);
  console.log(`▶ 기준 날짜(DB current_date): ${fmt(today)}`);

  // ---------- 1) 메뉴 ----------
  {
    const values = [];
    const params = [];
    MENU.forEach((m, i) => {
      const b = i * 4;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
      params.push(m[0], m[1], m[2], m[3]);
    });
    await pool.query(
      `INSERT INTO cafe_menu (category, name, price, cost) VALUES ${values.join(',')}`,
      params
    );
    console.log(`  · 메뉴 ${MENU.length}개`);
  }

  // ---------- 2) 판매 내역 (최근 N일: 지난달 전체 + 이번 달 확보) ----------
  const SALES_DAYS = 80;
  {
    const rows = []; // [sale_date, order_no, category, item_name, qty, amount]
    let orderNo = 0;
    for (let d = SALES_DAYS - 1; d >= 0; d--) {
      const day = addDays(today, -d);
      const dow = day.getDay(); // 0=일 .. 6=토
      const weekend = dow === 0 || dow === 6;
      const nOrders = weekend ? randint(16, 26) : randint(8, 16);
      for (let o = 0; o < nOrders; o++) {
        orderNo += 1;
        // 음료 1~2잔 (거의 항상)
        const nd = chance(0.3) ? 2 : 1;
        for (let k = 0; k < nd; k++) {
          const [name, price] = pick(DRINKS);
          rows.push([fmt(day), orderNo, '음료', name, 1, price]);
        }
        // 브런치 (주말 확률↑)
        if (chance(weekend ? 0.55 : 0.4)) {
          const [name, price] = pick(BRUNCH);
          rows.push([fmt(day), orderNo, '브런치', name, 1, price]);
        }
        // 펫베이커리 (강아지 동반 손님)
        if (chance(0.4)) {
          const [name, price] = pick(PETBK);
          const q = name.includes('쿠키') && chance(0.3) ? 2 : 1;
          rows.push([fmt(day), orderNo, '펫베이커리', name, q, price * q]);
        }
      }
    }
    // 청크 단위 배치 insert
    const CHUNK = 400;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      slice.forEach((r, j) => {
        const b = j * 6;
        values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
        params.push(r[0], r[1], r[2], r[3], r[4], r[5]);
      });
      await pool.query(
        `INSERT INTO cafe_sales (sale_date, order_no, category, item_name, qty, amount) VALUES ${values.join(',')}`,
        params
      );
    }
    console.log(`  · 판매 ${rows.length}건 (주문 ${orderNo}건, 최근 ${SALES_DAYS}일)`);
  }

  // ---------- 3) 단골 반려견 회원 ----------
  // birthday: 특정 월을 기준월 대비 offset(개월)로 지정 → 이번 달 생일 강아지 확보
  const m0 = today.getMonth();
  const bday = (yearsAgo, monthOffset, day) =>
    fmt(new Date(Y - yearsAgo, m0 + monthOffset, day));
  const pets = [
    // pet_name, breed, birthday, owner, phone, visits, last_visit
    ['두부', '비숑프리제', bday(5, 0, 5), '최민서', '010-2841-5566', 41, fmt(addDays(today, -2))],
    ['초코', '토이푸들', bday(6, 0, 24), '박서준', '010-3391-1042', 33, fmt(addDays(today, -1))],
    ['콩이', '말티즈', bday(5, 0, 12), '김지연', '010-7712-3388', 26, fmt(addDays(today, -3))],
    ['라떼', '사모예드', bday(4, 0, 28), '한소희', '010-5580-9921', 19, fmt(addDays(today, -5))],
    ['몽이', '포메라니안', bday(3, 0, 18), '정다은', '010-4402-7715', 15, fmt(addDays(today, -4))],
    ['뭉치', '진돗개', bday(6, 1, 8), '이하준', '010-6690-2213', 12, fmt(addDays(today, -9))],
    ['보리', '웰시코기', bday(5, 3, 15), '정우진', '010-2274-6608', 9, fmt(addDays(today, -12))],
    ['팥이', '닥스훈트', bday(3, -1, 20), '오세훈', '010-8811-4457', 6, fmt(addDays(today, -18))],
    ['하양', '스피츠', bday(7, 5, 3), '윤채원', '010-3325-7789', 4, fmt(addDays(today, -25))],
  ];
  {
    const values = [];
    const params = [];
    pets.forEach((p, i) => {
      const b = i * 7;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
      params.push(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
    });
    await pool.query(
      `INSERT INTO cafe_pets (pet_name, breed, birthday, owner_name, phone, visits, last_visit) VALUES ${values.join(',')}`,
      params
    );
    console.log(`  · 회원견 ${pets.length}마리`);
  }

  // ---------- 4) 생일파티 예약 ----------
  const reservations = [
    // reserve_date, pet_name, package, headcount, amount, status, memo
    [fmt(addDays(today, -20)), '두부', '생일파티 프리미엄 패키지', 8, 88000, '완료', '5살 생일, 포토존 만족도 높음'],
    [fmt(addDays(today, -6)), '초코', '생일파티 베이직 패키지', 6, 55000, '완료', '케이크 딸기맛 요청'],
    [fmt(addDays(today, 3)), '콩이', '생일파티 베이직 패키지', 5, 55000, '확정', '알러지: 닭고기 제외 케이크'],
    [fmt(addDays(today, 9)), '라떼', '생일파티 프리미엄 패키지', 10, 88000, '확정', '단체(견주 모임) 예약'],
    [fmt(addDays(today, 14)), '뭉치', '생일파티 베이직 패키지', 4, 55000, '문의', '주차 문의 남김'],
    [fmt(addDays(today, 21)), '몽이', '생일파티 프리미엄 패키지', 7, 88000, '확정', '풍선데코 추가 요청'],
  ];
  {
    const values = [];
    const params = [];
    reservations.forEach((r, i) => {
      const b = i * 7;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
      params.push(r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
    });
    await pool.query(
      `INSERT INTO cafe_reservations (reserve_date, pet_name, package_name, headcount, amount, status, memo) VALUES ${values.join(',')}`,
      params
    );
    console.log(`  · 예약 ${reservations.length}건`);
  }

  // ---------- 5) 재고 ----------
  const inventory = [
    // name, category, stock_qty, unit, reorder_level, expiry_date
    ['에티오피아 원두', '원두', 3.5, 'kg', 2, fmt(addDays(today, 120))],
    ['우유', '유제품', 6, 'L', 8, fmt(addDays(today, 4))],
    ['생크림', '유제품', 2, 'L', 3, fmt(addDays(today, 3))],
    ['밀가루', '베이커리', 10, 'kg', 5, fmt(addDays(today, 60))],
    ['계란', '베이커리', 30, '개', 24, fmt(addDays(today, 9))],
    ['단호박(펫케이크용)', '펫재료', 4, '개', 6, fmt(addDays(today, 6))],
    ['고구마(펫간식용)', '펫재료', 8, '개', 5, fmt(addDays(today, 12))],
    ['닭가슴살(펫간식용)', '펫재료', 2, 'kg', 3, fmt(addDays(today, 2))],
    ['요거트파우더(펫용)', '펫재료', 1.5, 'kg', 1, fmt(addDays(today, 40))],
    ['테이크아웃컵', '소모품', 200, '개', 300, null],
    ['냅킨', '소모품', 500, '개', 200, null],
  ];
  {
    const values = [];
    const params = [];
    inventory.forEach((r, i) => {
      const b = i * 6;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
      params.push(r[0], r[1], r[2], r[3], r[4], r[5]);
    });
    await pool.query(
      `INSERT INTO cafe_inventory (name, category, stock_qty, unit, reorder_level, expiry_date) VALUES ${values.join(',')}`,
      params
    );
    console.log(`  · 재고 ${inventory.length}개`);
  }

  console.log('✅ 시드 완료!');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ 시드 실패:', err);
  process.exit(1);
});
