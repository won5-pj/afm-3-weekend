# mybudget-analyst — 가계부 소비 분석 에이전트

`week-5/quest-5/mybudget` 가계부 앱이 Supabase에 쌓은 데이터를 **읽어서** 조회·패턴분석·절약조언을 해주는 서브에이전트.

```
[가계부 앱으로 데이터 쌓기] → [에이전트가 Supabase MCP로 DB 접속] → [질문]
   → DB 조회(SQL) + AI 분석 → [맞춤형 답변]
```

- 에이전트 정의: `.claude/agents/mybudget-analyst.md`
- 자주 쓰는 쿼리: [`SQL-cookbook.md`](./SQL-cookbook.md)
- DB 접속 설정: 루트 `.mcp.json` → 래퍼 `supabase-mcp.cmd` (Supabase MCP, **읽기 전용**)

## 할 수 있는 것

| 구분 | 예시 질문 |
|------|-----------|
| **기본조회** | "이번 달 얼마 썼어?", "식비로 제일 많이 쓴 날은?", "카테고리별 지출 순위" |
| **패턴분석** | "주중이랑 주말 중 언제 더 써?", "정기 지출이랑 아닌 거 구분해줘", "카테고리 비율" |
| **절약조언** | "어디서 줄일 수 있을까?", "다음 달 얼마 쓸 것 같아?", "예산 대비 어때?" |

---

## 연결 구조 (어떻게 인증되는가)

```
.mcp.json  ──실행──▶  supabase-mcp.cmd  ──토큰읽기──▶  supabase-token.txt (한 줄)
                              │
                              └──▶ npx @supabase/mcp-server-supabase --read-only --project-ref=ifrydgoofjalfufcpxka
```

- **왜 이렇게?** Supabase 개인 액세스 토큰을 `.mcp.json`에 직접 넣으면 Claude Code의 시크릿 마스킹이 값을 가려버려(토큰이 `•`로 오염) 인증이 깨진다. 그래서 토큰은 **별도 파일(`supabase-token.txt`)에 두고**, 래퍼(`supabase-mcp.cmd`)가 서버 실행 시점에 읽어 환경변수로 넘긴다.
- `supabase-token.txt` 는 **`.gitignore` 처리**되어 git에 올라가지 않는다.
- 래퍼는 프로세스 환경변수/재시작에 의존하지 않으므로, 토큰만 맞으면 **`/mcp` 재연결만으로** 인증된다.

## 토큰 설정/변경 (터미널 불필요)

1. https://supabase.com/dashboard/account/tokens 에서 개인 액세스 토큰(`sbp_...`) 발급
2. 이 폴더의 **`supabase-token.txt`** 파일을 메모장/VS Code 등으로 열어 **토큰 한 줄만** 붙여넣고 저장
   (파일이 없으면 새로 만든다. 파일명 정확히 `supabase-token.txt`)
3. Claude Code에서 **`/mcp` → supabase → Reconnect(재연결)**
4. 확인: 채팅에서 `이번 달 얼마 썼어?` → `mybudget-analyst`가 조회해서 답하면 성공

> 토큰 유효성만 빠르게 확인하려면(선택): 브라우저에서 위 대시보드에 로그인되어 있으면 토큰이 살아있는 것. MCP가 `Unauthorized`면 토큰 만료/오타일 가능성이 높으니 재발급 후 파일 교체.

## 설정 값 참고
- **Project ref**: `ifrydgoofjalfufcpxka` (앱 `server.js` 연결 문자열에서 확인)
- **모드**: `--read-only` (조회만, 데이터 변경 불가 — 분석 전용이라 안전)
- 데이터 **입력/수정**은 가계부 앱(`npm start` → http://localhost:3000)에서 한다.

## 검증용 시드 데이터
- `mybudget/seed-6months.js`, `mybudget/topup-may-jun.js` — 2026년 1~6월 자취생 소비 패턴 더미 데이터 생성(재실행 안전). 이미 데이터가 있으면 그 달은 건너뛴다.

## 문제 해결
- `/mcp`에 supabase가 안 뜸 → `.mcp.json`(루트)이 `supabase-mcp.cmd`를 가리키는지 확인.
- `Unauthorized` → `supabase-token.txt` 내용이 올바른 토큰 한 줄인지 확인(공백/BOM/여러 줄 금지), 재발급 후 교체, `/mcp` 재연결.
- 그래도 안 되면 Claude Code 완전 재시작.
