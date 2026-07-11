// 결제 관련 추가 마이그레이션 (재실행 안전)
//  1) orders.paid_at 컬럼 추가 (결제 승인 시각 — 마이페이지 최신순 정렬 기준)
//  2) 100원 테스트 상품 1개 삽입 (없을 때만)
//   실행: node add-payment-extras.js
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

const sql = postgres(DATABASE_URL, { prepare: false, ssl: 'require', max: 3, idle_timeout: 20, connect_timeout: 15 });

function svgImage(emoji, name, c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="480" height="480" fill="url(#g)"/>
  <circle cx="240" cy="205" r="128" fill="rgba(255,255,255,0.16)"/>
  <text x="240" y="205" font-size="150" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  <text x="240" y="410" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="'Malgun Gothic','Apple SD Gothic Neo',sans-serif" opacity="0.95">${name}</text>
</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

(async () => {
  try {
    // 1) paid_at 컬럼
    await sql`alter table public.orders add column if not exists paid_at timestamptz`;
    console.log('✔ orders.paid_at 컬럼 준비 완료');

    // 2) 100원 테스트 상품 (이름으로 중복 방지)
    const name = '결제 테스트 상품';
    const [{ exists }] = await sql`select exists(select 1 from public.products where name = ${name}) as exists`;
    if (exists) {
      console.log('skip  100원 상품 (이미 존재)');
    } else {
      await sql`
        insert into public.products (name, price, image_url, description)
        values (${name}, 100, ${svgImage('🧪', name, '#0f172a', '#6366f1')},
                '토스페이먼츠 결제를 100원으로 가볍게 테스트해볼 수 있는 상품입니다.')`;
      console.log('insert 100원 테스트 상품 추가');
    }

    const list = await sql`select id, name, price from public.products order by price asc limit 3`;
    console.log('\n최저가 상품 3개:');
    console.table(list.map((r) => ({ id: r.id, name: r.name, price: r.price.toLocaleString('ko-KR') + '원' })));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
})();
