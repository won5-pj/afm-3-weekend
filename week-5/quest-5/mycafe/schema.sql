-- ============================================================
-- 멍스데이(Mongsday) AI 운영 파트너앱 — 운영 데이터 스키마
-- Supabase(PostgreSQL). 테이블은 다른 앱과 충돌하지 않도록 cafe_ 접두사 사용.
-- (server.js 기동 시 자동 생성되며, seed.js 로 데모 데이터를 채운다.)
-- ============================================================

-- 메뉴판 (음료 / 브런치 / 펫베이커리 / 생일파티)
CREATE TABLE IF NOT EXISTS cafe_menu (
  id          SERIAL PRIMARY KEY,
  category    TEXT    NOT NULL,          -- 음료 / 브런치 / 펫베이커리 / 생일파티
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL,          -- 판매가(원)
  cost        INTEGER,                   -- 원가(원)
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 판매 내역 (아이템 단위 로그, order_no 로 한 주문 묶음)
CREATE TABLE IF NOT EXISTS cafe_sales (
  id          SERIAL PRIMARY KEY,
  sale_date   DATE    NOT NULL,
  order_no    INTEGER NOT NULL,          -- 같은 주문이면 동일 번호 (객단가 계산용)
  category    TEXT    NOT NULL,
  item_name   TEXT    NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  amount      INTEGER NOT NULL,          -- 합계금액(원) = 단가 x 수량
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 단골 반려견 회원
CREATE TABLE IF NOT EXISTS cafe_pets (
  id          SERIAL PRIMARY KEY,
  pet_name    TEXT    NOT NULL,
  breed       TEXT,
  birthday    DATE,                      -- 생일 (연도는 나이 표기용)
  owner_name  TEXT,
  phone       TEXT,
  visits      INTEGER DEFAULT 0,
  last_visit  DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 생일파티 예약 (우리 카페의 핵심 상품)
CREATE TABLE IF NOT EXISTS cafe_reservations (
  id            SERIAL PRIMARY KEY,
  reserve_date  DATE    NOT NULL,
  pet_name      TEXT,
  package_name  TEXT,                    -- 베이직 / 프리미엄 등
  headcount     INTEGER,                 -- 사람 인원
  amount        INTEGER,                 -- 예약 금액(원)
  status        TEXT DEFAULT '확정',      -- 확정 / 문의 / 취소 / 완료
  memo          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 재고 (원두/유제품/베이커리/펫재료/소모품)
CREATE TABLE IF NOT EXISTS cafe_inventory (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT,
  stock_qty      NUMERIC(10,2) DEFAULT 0,
  unit           TEXT,                   -- kg / L / 개 등
  reorder_level  NUMERIC(10,2),          -- 이 값 이하이면 발주 필요
  expiry_date    DATE,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
