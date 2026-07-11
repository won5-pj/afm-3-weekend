-- 가계부 앱 DB 스키마 (Supabase Postgres)
-- 서버(server.js) 최초 실행 시 initDb() 가 아래 테이블을 자동으로 생성합니다.
-- 참고용으로 이 파일에도 동일한 DDL 을 남겨둡니다.

create table if not exists budget_entries (
  id         bigint generated always as identity primary key,
  type       text not null check (type in ('income', 'expense')),  -- 수입(income) / 지출(expense)
  category   text not null,                                          -- 식비, 교통, 주거, 구독료, 경조사 ...
  amount     numeric(14, 2) not null check (amount >= 0),            -- 금액 (원)
  memo       text,                                                   -- 메모 (선택)
  date       date not null default current_date,                     -- 사용/수입 날짜
  created_at timestamptz not null default now()                      -- 등록 시각
);

-- 조회 성능을 위한 인덱스 (날짜/타입 기준 정렬·필터가 잦음)
create index if not exists idx_budget_entries_date on budget_entries (date desc);
create index if not exists idx_budget_entries_type on budget_entries (type);

-- 월 예산 테이블 (매월 반복 적용). category = '__total__' 이면 전체(월 통합) 예산.
create table if not exists budgets (
  category text primary key,                        -- 카테고리명 또는 '__total__'
  amount   numeric(14, 2) not null check (amount >= 0)
);

-- 프로필 테이블 (단일 사용자 — id=1 한 행만 유지)
-- 아바타 이미지는 ImageKit 에 업로드하고 URL 만 avatar_url 에 저장한다.
create table if not exists profile (
  id         smallint primary key default 1,
  name       text,
  email      text,
  bio        text,
  avatar_url text,                                  -- ImageKit 이미지 URL
  updated_at timestamptz not null default now(),
  constraint profile_singleton check (id = 1)       -- 항상 한 행(id=1)만 존재
);

-- 카테고리별 합계는 GROUP BY 로 계산 (server.js /api/summary 에서 사용)
-- 예시:
--   select type, category, sum(amount) as total, count(*) as count
--   from budget_entries
--   group by type, category
--   order by total desc;
