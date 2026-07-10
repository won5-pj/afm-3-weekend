// 5·6월 보충(top-up): 기존 엔트리는 건드리지 않고, 부족한 정기항목 + 일별 변동지출만 추가.
// 중복 방지: (같은 달에 같은 category+memo 인 정기항목) / (같은 날짜+category 인 변동지출) 은 건너뜀.
//   실행: node topup-may-jun.js

const postgres = require('postgres');

// --- .env 로더 (무의존성): .env 의 DATABASE_URL 등을 process.env 로 로드 ---
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8')
    .split(/\r?\n/).forEach((l) => {
      const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
} catch (e) {}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경변수가 필요합니다. .env 파일에 설정하세요.');

const sql = postgres(process.env.DATABASE_URL,
  { prepare: false, ssl: 'require', max: 3, connect_timeout: 15 });

function mulberry32(a){return function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const rnd = mulberry32(20260506);
const rint = (lo, hi) => Math.floor(rnd() * (hi - lo + 1)) + lo;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const round10 = (n) => Math.round(n / 10) * 10;

const FOOD_WEEKDAY = ['점심 김치찌개', '편의점 도시락', '회사 근처 백반', '김밥천국', '국밥 한 그릇', '샐러드', '분식', '동네 카페'];
const FOOD_WEEKEND = ['삼겹살 외식', '치킨 배달', '초밥', '마라탕', '브런치', '배달 야식', '파스타', '주말 장보기'];
const LEISURE = ['영화·팝콘', '전시회', '노래방', '볼링', 'PC방', '보드게임카페', '한강 나들이'];
const SHOP = ['옷 구매', '운동화', '생활용품', '무선 이어폰', '책 구매', '주방용품'];
const MED = ['감기약·병원', '피부과', '영양제'];

const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dow = (ym, d) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const ds = (ym, d) => `${ym}-${String(d).padStart(2, '0')}`;

const TARGETS = [{ ym: '2026-05', idx: 4 }, { ym: '2026-06', idx: 5 }];

function recurringWanted(ym, idx) {
  const mon = parseInt(ym.split('-')[1], 10);
  const r = [
    ['income', '급여', 3200000, `${mon}월 월급`, 5],
    ['expense', '주거', 700000, '월세', 1],
    ['expense', '교통', rint(52, 60) * 1000, '교통카드 충전', 2],
    ['expense', '구독료', 13500, '넷플릭스', 4],
    ['expense', '구독료', 10900, '유튜브 프리미엄', 4],
    ['expense', '기타', rint(52, 58) * 1000, '휴대폰 요금', 15],
  ];
  if (idx >= 2) r.push(['expense', '구독료', 4990, '쿠팡 와우', 4]);
  return r;
}

(async () => {
  try {
    let grand = 0;
    for (const { ym, idx } of TARGETS) {
      const existing = await sql`
        select category, memo, to_char(date,'YYYY-MM-DD') as date, type
        from budget_entries where to_char(date,'YYYY-MM') = ${ym}`;
      const haveCatMemo = new Set(existing.map((r) => `${r.category}|${r.memo}`)); // 정기 중복판정
      const haveDayCat = new Set(existing.map((r) => `${r.date}|${r.category}`));  // 변동 중복판정

      const rows = [];
      const foodGrow = 1 + idx * 0.045;
      const add = (type, category, amount, memo, day) => {
        const key = `${ds(ym, day)}|${category}`;
        rows.push({ type, category, amount: round10(amount), memo, date: ds(ym, day) });
        haveDayCat.add(key);
      };

      // 1) 부족한 정기항목만 추가
      for (const [type, cat, amt, memo, day] of recurringWanted(ym, idx)) {
        if (!haveCatMemo.has(`${cat}|${memo}`)) add(type, cat, amt, memo, day);
      }

      // 2) 일별 변동지출 (해당 날짜+카테고리가 이미 있으면 건너뜀)
      const dim = daysInMonth(ym);
      for (let d = 1; d <= dim; d++) {
        const weekend = dow(ym, d) === 0 || dow(ym, d) === 6;
        const free = (cat) => !haveDayCat.has(`${ds(ym, d)}|${cat}`);
        if (!weekend) {
          if (free('식비') && chance(0.5)) add('expense', '식비', rint(8, 14) * 1000 * foodGrow, pick(FOOD_WEEKDAY), d);
          if (free('여가') && chance(0.08)) add('expense', '여가', rint(10, 25) * 1000, pick(LEISURE), d);
        } else {
          if (free('식비') && chance(0.8)) add('expense', '식비', rint(20, 42) * 1000 * foodGrow, pick(FOOD_WEEKEND), d);
          if (free('여가') && chance(0.4)) add('expense', '여가', rint(15, 40) * 1000, pick(LEISURE), d);
          if (free('쇼핑') && chance(0.15)) add('expense', '쇼핑', rint(25, 90) * 1000, pick(SHOP), d);
        }
      }

      // 3) 없으면 채우는 비정기
      if (!existing.some((r) => r.category === '의료') && chance(0.8))
        add('expense', '의료', rint(6, 35) * 1000, pick(MED), rint(6, 26));

      if (rows.length) {
        await sql`insert into budget_entries ${sql(rows, 'type', 'category', 'amount', 'memo', 'date')}`;
      }
      grand += rows.length;
      console.log(`topup ${ym}: +${rows.length}건 (기존 ${existing.length}건 → ${existing.length + rows.length}건)`);
    }
    console.log(`\n총 +${grand}건 보충 완료.\n`);

    const summary = await sql`
      select to_char(date, 'YYYY-MM') as month,
             coalesce(sum(amount) filter (where type='income'), 0)::float8  as income,
             coalesce(sum(amount) filter (where type='expense'), 0)::float8 as expense,
             count(*)::int as cnt
      from budget_entries
      where date >= '2026-01-01' and date < '2026-08-01'
      group by month order by month`;
    console.table(summary.map((r) => ({
      month: r.month, income: r.income.toLocaleString('ko-KR'),
      expense: r.expense.toLocaleString('ko-KR'), cnt: r.cnt,
    })));
  } catch (e) { console.error('ERROR:', e.message); process.exitCode = 1; }
  finally { await sql.end(); }
})();
