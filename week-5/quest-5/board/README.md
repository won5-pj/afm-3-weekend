# 🗣️ 커뮤니티 게시판 (Supabase Auth + RLS)

로그인한 사용자만 글을 쓸 수 있고, **자기 글만 수정/삭제**할 수 있는 커뮤니티 앱입니다.
핵심 흐름: **[회원가입/로그인] → [게시글 목록(전체 공개)] → [글쓰기(로그인 필수)] → [수정/삭제(본인만)]**

- `index.html` — 단일 파일 앱 (React + Tailwind + supabase-js, 전부 CDN)
- `schema.sql` — DB 스키마 + RLS 정책 (이미 Supabase에 적용됨)

## 실행 방법

`index.html`은 정적 서버로 열어야 합니다(로그인 세션 저장 때문에 `file://` 보다 권장).

```bash
cd week-5/quest-5/board
npx serve .        # 또는  python -m http.server 5599
```

브라우저에서 `http://localhost:5599` 접속.

## 바로 로그인해볼 수 있는 테스트 계정

| 이름 | 이메일 | 비밀번호 |
|------|--------|----------|
| 앨리스 | `alice.board.test@gmail.com` | `password123` |
| 밥 | `bob.board.test@gmail.com` | `password123` |

## 데이터 모델 & 권한 (RLS)

**`profiles`** — 로그인 사용자 표시 이름. 회원가입 시 트리거(`handle_new_user`)로 자동 생성.
**`posts`** — 게시글 (`author_id` 기본값 `auth.uid()`, 수정 시 `updated_at` 자동 갱신).

| 동작 | 정책 | 대상 |
|------|------|------|
| 조회(SELECT) | 로그인한 누구나 모든 글 | `authenticated` |
| 작성(INSERT) | 로그인 + 본인(author_id = auth.uid())으로만 | `authenticated` |
| 수정(UPDATE) | 본인 글만 | `author_id = auth.uid()` |
| 삭제(DELETE) | 본인 글만 | `author_id = auth.uid()` |

RLS는 서버(Postgres)에서 강제되므로, UI를 우회해 REST API로 남의 글을 수정/삭제해도 **0건 처리**되어 차단됩니다. (E2E로 검증 완료)

## ⚠️ 이 Supabase 프로젝트에서 손본 두 가지 설정

1. **REST API(PostgREST)가 죽어 있던 문제 복구** — `authenticator` 롤에 `pgrst.db_schemas`
   설정이 비어 있어 REST 요청 전부가 503이었습니다. Supabase 기본값으로 복구했습니다:
   ```sql
   alter role authenticator set pgrst.db_schemas = 'public, graphql_public';
   alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';
   alter role authenticator set pgrst.db_anon_role = 'anon';
   notify pgrst, 'reload config';
   ```
   대시보드 **Settings → API → Exposed schemas** 가 `public, graphql_public` 로 보이는지 한 번 확인해 두면 좋습니다.

2. **이메일 인증(Confirm email)이 켜져 있음** — 회원가입 때마다 확인 메일을 보내려다
   무료 메일 quota를 초과하면 `email rate limit exceeded` 가 납니다.
   신규 가입이 **즉시** 로그인되게 하려면 대시보드
   **Authentication → Sign In / Providers → Email → "Confirm email" 끄기**를 권장합니다.
   (앱은 인증이 켜져 있어도/꺼져 있어도 동작하도록 만들어져 있습니다.)
