const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// .env 파일이 있으면 로드 (Node 20.6+ 내장 기능)
try { process.loadEnvFile(); } catch {}

const PORT = process.env.PORT || 3000;
const CONNECTION_STRING = process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('환경변수 DATABASE_URL이 필요합니다. .env 파일에 DATABASE_URL을 설정하세요. (.env.example 참고)');
  process.exit(1);
}

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

// DB row -> API 응답 형태 (id를 "todo-N" 문자열로 매핑해 기존 프론트와 호환)
function toTodo(row) {
  return {
    id: 'todo-' + row.id,
    done: row.done,
    title: row.title,
    due: row.due,
    priority: row.priority,
  };
}

// "todo-3" -> 3 (형식이 틀리면 null)
function parseId(idStr) {
  return /^todo-\d+$/.test(idStr) ? parseInt(idStr.slice(5), 10) : null;
}

// 테이블 생성 + (비어 있으면) 기본 할 일 5개 시드
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id         SERIAL PRIMARY KEY,
      done       BOOLEAN     NOT NULL DEFAULT false,
      title      TEXT        NOT NULL,
      due        TEXT        NOT NULL DEFAULT '',
      priority   TEXT        NOT NULL DEFAULT '보통',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM todos');
  if (rows[0].n === 0) {
    const seed = [
      ['이메일 확인하고 답장하기', '오늘 오전', '높음'],
      ['주간 업무 보고서 작성하기', '오늘 오후 5시', '높음'],
      ['장보기 (우유, 계란, 빵)', '퇴근 후', '보통'],
      ['운동 2시간', '', '보통'],
      ['강의 다시보기', '', '보통'],
    ];
    for (const [title, due, priority] of seed) {
      await pool.query(
        'INSERT INTO todos (title, due, priority) VALUES ($1, $2, $3)',
        [title, due, priority]
      );
    }
    console.log('기본 할 일 5개를 시드했습니다.');
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// JSON body 직접 수집/파싱 (내장 모듈만, 1MB 초과 차단, 잘못된 JSON 방어)
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

// ---- 정적 파일 서빙 ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 경로 탈출 / dotfile 차단
  const segments = urlPath.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s.startsWith('.'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const filePath = path.join(__dirname, ...segments);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- API 라우팅 ----
async function handleApi(req, res) {
  const urlPath = req.url.split('?')[0];
  const method = req.method;

  // GET /api/todos
  if (method === 'GET' && urlPath === '/api/todos') {
    const { rows } = await pool.query('SELECT * FROM todos ORDER BY id ASC');
    return sendJson(res, 200, rows.map(toTodo));
  }

  // POST /api/todos
  if (method === 'POST' && urlPath === '/api/todos') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return sendJson(res, 400, { error: 'title is required' });
    const due = typeof body.due === 'string' ? body.due : '';
    const priority = typeof body.priority === 'string' && body.priority ? body.priority : '보통';
    const { rows } = await pool.query(
      'INSERT INTO todos (title, due, priority) VALUES ($1, $2, $3) RETURNING *',
      [title, due, priority]
    );
    return sendJson(res, 201, toTodo(rows[0]));
  }

  // /api/todos/{id} (PATCH, DELETE)
  const m = urlPath.match(/^\/api\/todos\/([^/]+)$/);
  if (m) {
    const dbId = parseId(m[1]);
    if (dbId === null) return sendJson(res, 400, { error: 'invalid id' });

    if (method === 'PATCH') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: 'invalid json' });
      }
      if (typeof body.done !== 'boolean') {
        return sendJson(res, 400, { error: 'done must be boolean' });
      }
      const { rows } = await pool.query(
        'UPDATE todos SET done = $1 WHERE id = $2 RETURNING *',
        [body.done, dbId]
      );
      if (rows.length === 0) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, toTodo(rows[0]));
    }

    if (method === 'DELETE') {
      const { rowCount } = await pool.query('DELETE FROM todos WHERE id = $1', [dbId]);
      if (rowCount === 0) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch((err) => {
      console.error('API error:', err);
      sendJson(res, 500, { error: 'internal server error' });
    });
  } else {
    serveStatic(req, res);
  }
});

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Todo(DB) 서버 실행 중 → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err);
    process.exit(1);
  });
