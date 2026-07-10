-- ============================================================
-- 커뮤니티 게시판 스키마: profiles + posts + RLS
-- 핵심: [회원가입/로그인] → [목록(전체공개)] → [글쓰기(로그인)] → [수정/삭제(본인만)]
-- ============================================================

-- 1) profiles: auth.users 와 1:1, 작성자 표시 이름(username) 보관
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 로그인한 누구나 프로필(작성자 이름)을 조회 가능
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

-- 본인 프로필만 생성/수정
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) 회원가입 시 profiles 자동 생성 (username = 가입 시 입력값, 없으면 이메일 아이디)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) posts: 게시글
create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text not null,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- 조회: 로그인한 누구나 모든 글 조회 가능
drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated
  on public.posts for select
  to authenticated
  using (true);

-- 작성: 로그인 사용자, 본인(author_id = 로그인 uid)으로만
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

-- 수정: 본인 글만
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
  on public.posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- 삭제: 본인 글만
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid());

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx  on public.posts (author_id);

-- 4) 수정 시 updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- 5) post_likes: 게시글 좋아요(하트). 사용자당 글 1회 (PK로 중복 방지)
create table if not exists public.post_likes (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid   not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

-- 조회: 로그인한 누구나 (좋아요 수 집계용)
drop policy if exists post_likes_select_authenticated on public.post_likes;
create policy post_likes_select_authenticated
  on public.post_likes for select
  to authenticated
  using (true);

-- 추가(좋아요): 본인 좋아요만
drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own
  on public.post_likes for insert
  to authenticated
  with check (user_id = auth.uid());

-- 삭제(좋아요 취소): 본인 좋아요만
drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own
  on public.post_likes for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);

-- 6) comments: 게시글 댓글(리플). 다른 사람 글에도 달 수 있고, 본인 댓글만 삭제 가능
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts(id) on delete cascade,
  author_id  uuid   not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text   not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

-- 조회: 로그인한 누구나 모든 댓글 조회
drop policy if exists comments_select_authenticated on public.comments;
create policy comments_select_authenticated
  on public.comments for select
  to authenticated
  using (true);

-- 작성: 로그인 사용자, 본인(author_id = 로그인 uid)으로만 (글 주인 여부 무관 → 남의 글에도 가능)
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

-- 삭제: 본인 댓글만
drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());

create index if not exists comments_post_id_idx   on public.comments (post_id, created_at);
create index if not exists comments_author_id_idx on public.comments (author_id);
