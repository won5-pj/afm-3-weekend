-- ============================================================
-- 남성의류 쇼핑몰 스키마: products (공개) + cart (본인만)
-- 핵심 흐름: [상품 목록(DB, 공개)] → [장바구니 담기(로그인 필수)]
--            → [내 장바구니 관리] → [합계 계산]
--
-- ⚠️ 이 파일은 참고용입니다. 실제 적용은 `node seed.js` 가 수행합니다.
--    (Supabase pooler 에 직접 연결해 아래 DDL 실행 + 상품 10개 시드)
-- ============================================================

-- 1) products: 모든 상품 데이터 (누구나 조회 가능 · 공개)
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text    not null,               -- 상품명
  price       integer not null check (price >= 0),  -- 가격(원)
  image_url   text,                            -- 이미지 (data URI SVG)
  description text,                            -- 간단한 설명
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

-- 조회: 로그인 없이도 누구나(anon + authenticated) 모든 상품을 볼 수 있음
drop policy if exists products_select_public on public.products;
create policy products_select_public
  on public.products for select
  to anon, authenticated
  using (true);
-- (INSERT/UPDATE/DELETE 정책 없음 → 클라이언트에서 상품 쓰기 불가. 시드만 서버로 주입)

-- 2) cart: 사용자별 장바구니 (로그인한 본인만 접근)
create table if not exists public.cart (
  id         bigint generated always as identity primary key,
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  product_id bigint  not null references public.products(id) on delete cascade,
  quantity   integer not null default 1 check (quantity >= 1),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)   -- 같은 상품은 한 줄로 (담기 시 수량 누적)
);

alter table public.cart enable row level security;

-- 조회: 본인 장바구니만
drop policy if exists cart_select_own on public.cart;
create policy cart_select_own
  on public.cart for select
  to authenticated
  using (user_id = auth.uid());

-- 담기: 본인(user_id = 로그인 uid)으로만 삽입
drop policy if exists cart_insert_own on public.cart;
create policy cart_insert_own
  on public.cart for insert
  to authenticated
  with check (user_id = auth.uid());

-- 수량변경: 본인 항목만
drop policy if exists cart_update_own on public.cart;
create policy cart_update_own
  on public.cart for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 삭제: 본인 항목만
drop policy if exists cart_delete_own on public.cart;
create policy cart_delete_own
  on public.cart for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists cart_user_id_idx on public.cart (user_id);

-- 3) ratings: 상품 별점 (1~5점) — 평균은 공개 조회, 남기기/수정은 본인만
create table if not exists public.ratings (
  id         bigint generated always as identity primary key,
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  product_id bigint  not null references public.products(id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)   -- 사용자당 상품별 1개 (재평가는 수정)
);

alter table public.ratings enable row level security;

-- 조회: 평균 계산용으로 누구나(anon+authenticated) 조회 가능
drop policy if exists ratings_select_public on public.ratings;
create policy ratings_select_public
  on public.ratings for select
  to anon, authenticated
  using (true);

-- 등록: 본인(user_id = 로그인 uid)으로만
drop policy if exists ratings_insert_own on public.ratings;
create policy ratings_insert_own
  on public.ratings for insert
  to authenticated
  with check (user_id = auth.uid());

-- 수정: 본인 별점만
drop policy if exists ratings_update_own on public.ratings;
create policy ratings_update_own
  on public.ratings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 삭제: 본인 별점만
drop policy if exists ratings_delete_own on public.ratings;
create policy ratings_delete_own
  on public.ratings for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists ratings_product_id_idx on public.ratings (product_id);
