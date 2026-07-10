// 남성의류 쇼핑몰 DB 셋업 + 시드
//  1) products / cart 테이블 + RLS 정책 생성 (schema.sql 과 동일 DDL)
//  2) 남성의류 상품 10개 삽입 (이미지는 외부 의존성 없는 SVG data URI)
// Supabase pooler(6543, transaction mode)에 직접 연결. prepare:false 필수.
//   실행: node seed.js
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

// ── 상품 이미지: 깔끔한 SVG(data URI). 상품마다 다른 그라데이션 + 이모지 + 상품명 ──
function svgImage(emoji, name, c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="480" height="480" fill="url(#g)"/>
  <circle cx="240" cy="205" r="128" fill="rgba(255,255,255,0.16)"/>
  <text x="240" y="205" font-size="150" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  <text x="240" y="410" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle"
        font-family="'Malgun Gothic','Apple SD Gothic Neo',sans-serif" opacity="0.95">${name}</text>
</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const PRODUCTS = [
  ['옥스퍼드 셔츠',       39900, '👔', '데일리로 입기 좋은 클래식 옥스퍼드 셔츠',      '#4f46e5', '#818cf8'],
  ['슬림핏 청바지',       59000, '👖', '다리가 길어 보이는 슬림핏 워싱 데님',          '#1e3a8a', '#3b82f6'],
  ['베이직 반팔 티셔츠',  18000, '👕', '코튼 100% 부드러운 무지 반팔 티셔츠',          '#0f766e', '#2dd4bf'],
  ['오버핏 후드티',       49000, '🧥', '편하게 입는 기모 오버핏 후드 스웨트',          '#7c3aed', '#c084fc'],
  ['크루넥 니트',         42000, '🧶', '포근하고 부드러운 크루넥 라운드 니트',          '#b45309', '#fbbf24'],
  ['치노 팬츠',           44000, '👖', '어디에나 잘 어울리는 베이직 치노 팬츠',        '#166534', '#4ade80'],
  ['브이넥 카디건',       52000, '🧥', '간절기 필수 아이템 브이넥 카디건',            '#9d174d', '#f472b6'],
  ['경량 패딩 점퍼',      89000, '🧥', '가볍고 따뜻한 겨울용 경량 패딩 점퍼',          '#0c4a6e', '#38bdf8'],
  ['스트레치 슬랙스',     39000, '👔', '오피스룩을 완성하는 스트레치 슬랙스',          '#334155', '#94a3b8'],
  ['오버핏 맨투맨',       36000, '👕', '데일리로 좋은 오버핏 맨투맨 스웨트셔츠',        '#be123c', '#fb7185'],
];

(async () => {
  try {
    console.log('▶ 테이블/정책 생성 중...');

    // products
    await sql`
      create table if not exists public.products (
        id          bigint generated always as identity primary key,
        name        text    not null,
        price       integer not null check (price >= 0),
        image_url   text,
        description text,
        created_at  timestamptz not null default now()
      )`;
    await sql`alter table public.products enable row level security`;
    await sql`drop policy if exists products_select_public on public.products`;
    await sql`
      create policy products_select_public on public.products
        for select to anon, authenticated using (true)`;

    // cart
    await sql`
      create table if not exists public.cart (
        id         bigint generated always as identity primary key,
        user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
        product_id bigint  not null references public.products(id) on delete cascade,
        quantity   integer not null default 1 check (quantity >= 1),
        created_at timestamptz not null default now(),
        unique (user_id, product_id)
      )`;
    await sql`alter table public.cart enable row level security`;
    await sql`drop policy if exists cart_select_own on public.cart`;
    await sql`create policy cart_select_own on public.cart for select to authenticated using (user_id = auth.uid())`;
    await sql`drop policy if exists cart_insert_own on public.cart`;
    await sql`create policy cart_insert_own on public.cart for insert to authenticated with check (user_id = auth.uid())`;
    await sql`drop policy if exists cart_update_own on public.cart`;
    await sql`create policy cart_update_own on public.cart for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())`;
    await sql`drop policy if exists cart_delete_own on public.cart`;
    await sql`create policy cart_delete_own on public.cart for delete to authenticated using (user_id = auth.uid())`;
    await sql`create index if not exists cart_user_id_idx on public.cart (user_id)`;

    // ratings: 상품 별점 (평균은 공개 조회, 남기기/수정은 본인만) · 사용자당 상품별 1개
    await sql`
      create table if not exists public.ratings (
        id         bigint generated always as identity primary key,
        user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
        product_id bigint  not null references public.products(id) on delete cascade,
        rating     integer not null check (rating between 1 and 5),
        created_at timestamptz not null default now(),
        unique (user_id, product_id)
      )`;
    await sql`alter table public.ratings enable row level security`;
    // 조회: 평균 계산용으로 누구나(anon+authenticated) 조회 가능
    await sql`drop policy if exists ratings_select_public on public.ratings`;
    await sql`create policy ratings_select_public on public.ratings for select to anon, authenticated using (true)`;
    // 남기기/수정/삭제: 본인 것만
    await sql`drop policy if exists ratings_insert_own on public.ratings`;
    await sql`create policy ratings_insert_own on public.ratings for insert to authenticated with check (user_id = auth.uid())`;
    await sql`drop policy if exists ratings_update_own on public.ratings`;
    await sql`create policy ratings_update_own on public.ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())`;
    await sql`drop policy if exists ratings_delete_own on public.ratings`;
    await sql`create policy ratings_delete_own on public.ratings for delete to authenticated using (user_id = auth.uid())`;
    await sql`create index if not exists ratings_product_id_idx on public.ratings (product_id)`;

    console.log('✔ 테이블/RLS 정책 준비 완료');

    // 시드: 이미 상품이 있으면 건너뜀 (재실행 안전)
    const [{ count }] = await sql`select count(*)::int as count from public.products`;
    if (count > 0) {
      console.log(`skip  상품 시드 (이미 ${count}건 존재)`);
    } else {
      const rows = PRODUCTS.map(([name, price, emoji, description, c1, c2]) => ({
        name, price, description,
        image_url: svgImage(emoji, name, c1, c2),
      }));
      await sql`insert into public.products ${sql(rows, 'name', 'price', 'image_url', 'description')}`;
      console.log(`insert 상품 ${rows.length}건 삽입 완료`);
    }

    // 별점 샘플: 평균이 보이도록 기존 계정으로 몇 건 넣기 (이미 있으면 skip, 결정적 분포)
    const [{ count: rcount }] = await sql`select count(*)::int as count from public.ratings`;
    if (rcount > 0) {
      console.log(`skip  별점 시드 (이미 ${rcount}건 존재)`);
    } else {
      const users = await sql`select id from auth.users order by created_at limit 6`;
      const prods = await sql`select id from public.products order by id`;
      if (users.length === 0) {
        console.log('skip  별점 시드 (auth.users 없음 — 앱에서 로그인 후 별점 등록)');
      } else {
        const rrows = [];
        for (let pi = 0; pi < prods.length; pi++) {
          for (let ui = 0; ui < users.length; ui++) {
            if ((pi * 7 + ui * 13) % 10 < 6) {                 // ~60% 조합만 평가
              rrows.push({ user_id: users[ui].id, product_id: prods[pi].id, rating: 3 + ((pi + ui) % 3) });
            }
          }
        }
        if (rrows.length) {
          await sql`insert into public.ratings ${sql(rrows, 'user_id', 'product_id', 'rating')} on conflict (user_id, product_id) do nothing`;
          console.log(`insert 별점 샘플 ${rrows.length}건 (사용자 ${users.length}명)`);
        }
      }
    }

    const list = await sql`
      select p.id, p.name, p.price,
             round(avg(r.rating), 1) as avg_rating, count(r.id)::int as rating_count
      from public.products p left join public.ratings r on r.product_id = p.id
      group by p.id order by p.id`;
    console.log('\n등록된 상품 (별점 포함):');
    console.table(list.map((r) => ({
      id: r.id, name: r.name, price: r.price.toLocaleString('ko-KR') + '원',
      별점: r.rating_count ? `${r.avg_rating} (${r.rating_count})` : '-',
    })));
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
})();
