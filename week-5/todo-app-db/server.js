// Todo App Server (Postgres/DB 버전)
// 저장: Supabase Postgres. pooler(transaction mode, 6543) 이므로 prepared statement 비활성화 필수.
//   - 드라이버: postgres (porsager) — `prepare: false`
//   - 정적 파일은 Node 내장 http 로 직접 서빙

const http = require('http');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// JWT 설정 (운영 배포 시 반드시 환경변수 JWT_SECRET 지정)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d';

// 연결 문자열 (env 로 덮어쓸 수 있게 하되, 제공된 URL 을 기본값으로)
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

// pgbouncer transaction mode 호환 설정
const sql = postgres(DATABASE_URL, {
  prepare: false, // ★ transaction pooler 에서는 prepared statement 사용 불가
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 15,
});

// 최초 실행 시 보여줄 기본 할일
const SEED_TODOS = [
  { text: '이메일 확인하고 답장하기', done: false },
  { text: '운동 30분 하기', done: false },
  { text: '장보기 (우유, 계란, 빵)', done: true },
  { text: '프로젝트 보고서 작성하기', done: false },
  { text: '친구에게 연락하기', done: false },
];

// 테이블 생성 + (비어 있으면) 시드
// 주의: 같은 Supabase 프로젝트를 쓰는 week-4/todo-app-db 가 "todos" 테이블(title/due/priority 스키마)을
// 이미 사용 중이라, 스키마 충돌을 피하기 위해 이 앱은 "todos_v2" 테이블을 별도로 사용한다.
async function initDb() {
  await sql`
    create table if not exists users (
      id            bigint generated always as identity primary key,
      username      text not null unique,
      password_hash text not null,
      created_at    timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists todos_v2 (
      id         bigint generated always as identity primary key,
      user_id    bigint references users(id) on delete cascade,
      text       text not null,
      done       boolean not null default false,
      created_at timestamptz not null default now()
    )
  `;
  // 기존(로그인 기능 도입 이전) todos_v2 테이블에는 user_id 컬럼이 없을 수 있으므로 보강
  await sql`alter table todos_v2 add column if not exists user_id bigint references users(id) on delete cascade`;
}

// ---------------------------------------------------------------------------
// 사용자 인증
// ---------------------------------------------------------------------------
function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function signup(username, password) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const [user] = await sql`
    insert into users ${sql({ username, password_hash: passwordHash }, 'username', 'password_hash')}
    returning id, username
  `;
  for (const t of SEED_TODOS) {
    await sql`insert into todos_v2 ${sql({ user_id: user.id, text: t.text, done: t.done }, 'user_id', 'text', 'done')}`;
  }
  return user;
}

async function login(username, password) {
  const [user] = await sql`select id, username, password_hash from users where username = ${username}`;
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

// 요청의 Authorization: Bearer <token> 검증, 성공 시 { id, username } 반환
function authenticate(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    return { id: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 데이터 접근 함수 (모두 user_id 로 범위 제한)
// ---------------------------------------------------------------------------
async function getTodos(userId) {
  return await sql`select id, text, done from todos_v2 where user_id = ${userId} order by id asc`;
}

async function createTodo(userId, text) {
  const [row] = await sql`
    insert into todos_v2 ${sql({ user_id: userId, text, done: false }, 'user_id', 'text', 'done')}
    returning id, text, done
  `;
  return row;
}

async function toggleTodo(userId, id) {
  const [row] = await sql`
    update todos_v2 set done = not done where id = ${id} and user_id = ${userId}
    returning id, text, done
  `;
  return row || null;
}

async function deleteTodo(userId, id) {
  const [row] = await sql`delete from todos_v2 where id = ${id} and user_id = ${userId} returning id`;
  return !!row;
}

// ---------------------------------------------------------------------------
// 헬퍼: 응답 / 본문 파싱
// ---------------------------------------------------------------------------
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('잘못된 JSON 본문입니다.'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 정적 파일 서빙
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(res, fileName) {
  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (fileName === 'index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
            '<title>Todo App</title></head><body style="font-family:sans-serif;padding:2rem">' +
            '<h1>Todo App (DB) 서버 실행 중</h1>' +
            '<p>API 는 <code>GET /api/todos</code> 로 확인하세요.</p>' +
            '</body></html>'
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // --- POST /api/auth/signup  (회원가입, body: { username, password }) ---
    if (method === 'POST' && pathname === '/api/auth/signup') {
      const body = await readJsonBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      if (!username || !password) return sendJson(res, 400, { error: '아이디와 비밀번호를 입력해주세요.' });
      if (password.length < 4) return sendJson(res, 400, { error: '비밀번호는 4자 이상이어야 합니다.' });
      const existing = await sql`select id from users where username = ${username}`;
      if (existing.length > 0) return sendJson(res, 409, { error: '이미 사용 중인 아이디입니다.' });
      const user = await signup(username, password);
      const token = signToken(user);
      return sendJson(res, 201, { token, user: { id: Number(user.id), username: user.username } });
    }

    // --- POST /api/auth/login  (로그인, body: { username, password }) ---
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      const user = await login(username, password);
      if (!user) return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      const token = signToken(user);
      return sendJson(res, 200, { token, user: { id: Number(user.id), username: user.username } });
    }

    // --- /api/todos* 는 로그인 필요 ---
    if (pathname === '/api/todos' || pathname.startsWith('/api/todos/')) {
      const authUser = authenticate(req);
      if (!authUser) return sendJson(res, 401, { error: '로그인이 필요합니다.' });
      const userId = authUser.id;

      // --- POST /api/todos  (추가, body: { text }) ---
      if (method === 'POST' && pathname === '/api/todos') {
        const body = await readJsonBody(req);
        const text = (body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: '할일 내용(text)이 필요합니다.' });
        const created = await createTodo(userId, text);
        return sendJson(res, 201, { id: Number(created.id), text: created.text, done: created.done });
      }

      // --- DELETE /api/todos/:id ---
      const deleteMatch = pathname.match(/^\/api\/todos\/(\d+)$/);
      if (method === 'DELETE' && deleteMatch) {
        const id = parseInt(deleteMatch[1], 10);
        const ok = await deleteTodo(userId, id);
        if (!ok) return sendJson(res, 404, { error: `id=${id} 할일을 찾을 수 없습니다.` });
        return sendJson(res, 200, { ok: true, id });
      }

      // --- GET /api/todos ---
      if (method === 'GET' && pathname === '/api/todos') {
        const todos = await getTodos(userId);
        // id 를 숫자로 변환 (bigint → 문자열로 올 수 있음)
        return sendJson(
          res,
          200,
          todos.map((t) => ({ id: Number(t.id), text: t.text, done: t.done }))
        );
      }

      // --- POST /api/todos/:id/toggle ---
      const toggleMatch = pathname.match(/^\/api\/todos\/(\d+)\/toggle$/);
      if (method === 'POST' && toggleMatch) {
        const id = parseInt(toggleMatch[1], 10);
        const updated = await toggleTodo(userId, id);
        if (!updated) return sendJson(res, 404, { error: `id=${id} 할일을 찾을 수 없습니다.` });
        return sendJson(res, 200, { id: Number(updated.id), text: updated.text, done: updated.done });
      }
    }

    // --- 정적: / 또는 /index.html ---
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return serveStatic(res, 'index.html');
    }

    // --- 기타 정적 파일 (디렉터리 탈출 방지) ---
    if (method === 'GET') {
      const safeName = path.basename(pathname);
      if (safeName && safeName !== '/' && fs.existsSync(path.join(ROOT, safeName))) {
        return serveStatic(res, safeName);
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error(`${method} ${pathname} 처리 실패:`, err.message);
    if (!res.headersSent) sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

// DB 초기화 후 서버 시작
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Todo App (DB) 서버 실행 중: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패 — 서버를 시작하지 못했습니다:', err);
    process.exit(1);
  });
