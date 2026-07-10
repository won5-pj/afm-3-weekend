// 검증용 시드: 2026-01 ~ 2026-06 (완료 6개월) 자취생 가계부 더미 데이터를 Supabase DB에 삽입.
// server.js 와 동일한 연결/드라이버 설정을 사용한다(포트 6543 pooler, prepare:false).
// 이미 데이터가 있는 달은 건너뛴다 → 재실행해도 안전.
//   실행: node seed-6months.js

const postgres = require('postgres');

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

const sql = postgres(DATABASE_URL, {
  prepare: false,
  ssl: 'require',
  max: 3,
  idle_timeout: 20,
  connect_timeout: 15,
});

// --- 재현 가능한 시드 RNG (mulberry32) ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260710);
const rint = (lo, hi) => Math.floor(rnd() * (hi - lo + 1)) + lo;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const round10 = (n) => Math.round(n / 10) * 10;

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

const FOOD_WEEKDAY = ['점심 김치찌개', '편의점 도시락', '회사 근처 백반', '김밥천국', '국밥 한 그릇', '샐러드', '분식', '동네 카페'];
const FOOD_WEEKEND = ['주말 장보기', '삼겹살 외식', '치킨 배달', '초밥', '마라탕', '브런치', '배달 야식', '파스타'];
const LEISURE = ['영화·팝콘', '전시회', '노래방', '볼링', 'PC방', '보드게임카페', '한강 나들이'];
const SHOP = ['옷 구매', '운동화', '생활용품', '무선 이어폰', '책 구매', '주방용품'];
const MED = ['감기약·병원', '치과 스케일링', '피부과', '영양제'];
const EVENT = ['동료 결혼식 축의금', '조의금', '친구 돌잔치'];

const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dow = (ym, d) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }; // 0=일..6=토
const ds = (ym, d) => `${ym}-${String(d).padStart(2, '0')}`;

function genMonth(ym, idx) {
  const rows = [];
  const foodGrow = 1 + idx * 0.045; // 식비 완만한 상승 추세(절약 조언용)
  const add = (type, category, amount, memo, day) =>
    rows.push({ type, category, amount: round10(amount), memo, date: ds(ym, day) });

  const mon = parseInt(ym.split('-')[1], 10);

  // 수입 (정기 급여 + 가끔 부수입)
  add('income', '급여', 3200000, `${mon}월 월급`, 5);
  if (idx === 5) add('income', '부수입', 250000, '분기 인센티브', 20);
  if (chance(0.4)) add('income', '부수입', rint(60, 220) * 1000, '중고거래 판매', rint(8, 25));

  // 정기 지출 (매월 반복 → 정기성 탐지용)
  add('expense', '주거', 700000, '월세', 1);
  add('expense', '교통', rint(52, 60) * 1000, '교통카드 충전', 2);
  if (chance(0.6)) add('expense', '교통', rint(45, 55) * 1000, '교통카드 충전', rint(16, 20));
  add('expense', '구독료', 13500, '넷플릭스', 4);
  add('expense', '구독료', 10900, '유튜브 프리미엄', 4);
  if (idx >= 2) add('expense', '구독료', 4990, '쿠팡 와우', 4); // 3월부터 구독 추가
  add('expense', '기타', rint(52, 58) * 1000, '휴대폰 요금', 15);

  // 변동 지출: 날짜별 (주말 지출을 더 크게 → 주중/주말 패턴 형성)
  const dim = daysInMonth(ym);
  for (let d = 1; d <= dim; d++) {
    const weekend = dow(ym, d) === 0 || dow(ym, d) === 6;
    if (!weekend) {
      if (chance(0.55)) add('expense', '식비', rint(8, 14) * 1000 * foodGrow, pick(FOOD_WEEKDAY), d);
      if (chance(0.12)) add('expense', '식비', rint(4, 7) * 1000, '편의점 간식', d);
      if (chance(0.08)) add('expense', '여가', rint(10, 25) * 1000, pick(LEISURE), d);
    } else {
      if (chance(0.85)) add('expense', '식비', rint(20, 42) * 1000 * foodGrow, pick(FOOD_WEEKEND), d);
      if (chance(0.45)) add('expense', '여가', rint(15, 40) * 1000, pick(LEISURE), d);
      if (chance(0.18)) add('expense', '쇼핑', rint(25, 90) * 1000, pick(SHOP), d);
    }
  }

  // 월 비정기 이벤트
  if (chance(0.7)) add('expense', '의료', rint(6, 40) * 1000, pick(MED), rint(6, 26));
  if (chance(0.35)) add('expense', '경조사', 100000, pick(EVENT), rint(8, 24));
  if (chance(0.5)) add('expense', '쇼핑', rint(20, 70) * 1000, pick(SHOP), rint(5, 27));

  return rows;
}

(async () => {
  try {
    const existing = await sql`
      select to_char(date, 'YYYY-MM') as m, count(*)::int as c
      from budget_entries
      where date >= '2026-01-01' and date < '2026-07-01'
      group by m`;
    const have = new Map(existing.map((r) => [r.m, r.c]));

    let total = 0;
    for (let i = 0; i < MONTHS.length; i++) {
      const ym = MONTHS[i];
      if (have.get(ym)) { console.log(`skip  ${ym} (이미 ${have.get(ym)}건)`); continue; }
      const rows = genMonth(ym, i);
      await sql`insert into budget_entries ${sql(rows, 'type', 'category', 'amount', 'memo', 'date')}`;
      total += rows.length;
      console.log(`insert ${ym}: ${rows.length}건`);
    }
    console.log(`\n총 ${total}건 삽입 완료.\n`);

    const summary = await sql`
      select to_char(date, 'YYYY-MM') as month,
             coalesce(sum(amount) filter (where type='income'), 0)::float8  as income,
             coalesce(sum(amount) filter (where type='expense'), 0)::float8 as expense,
             count(*)::int as cnt
      from budget_entries
      where date >= '2026-01-01' and date < '2026-08-01'
      group by month order by month`;
    console.log('월별 요약(수입/지출/건수):');
    console.table(summary.map((r) => ({
      month: r.month,
      income: r.income.toLocaleString('ko-KR'),
      expense: r.expense.toLocaleString('ko-KR'),
      cnt: r.cnt,
    })));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
})();
