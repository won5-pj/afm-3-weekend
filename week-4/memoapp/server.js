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

// DB row -> API 응답 형태
function toMemo(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// "123" -> 123 (형식이 틀리면 null)
function parseId(idStr) {
  return /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null;
}

// 메모 테이블 생성
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id         SERIAL PRIMARY KEY,
      title      TEXT        NOT NULL DEFAULT '',
      content    TEXT        NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('memos 테이블 준비 완료');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// JSON body 직접 수집/파싱 (1MB 초과 차단, 잘못된 JSON 방어)
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

  // GET /api/memos — 최근 수정순
  if (method === 'GET' && urlPath === '/api/memos') {
    const { rows } = await pool.query('SELECT * FROM memos ORDER BY updated_at DESC, id DESC');
    return sendJson(res, 200, rows.map(toMemo));
  }

  // POST /api/memos
  if (method === 'POST' && urlPath === '/api/memos') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const title = typeof body.title === 'string' ? body.title : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const { rows } = await pool.query(
      'INSERT INTO memos (title, content) VALUES ($1, $2) RETURNING *',
      [title, content]
    );
    return sendJson(res, 201, toMemo(rows[0]));
  }

  // /api/memos/{id} (PATCH, DELETE)
  const m = urlPath.match(/^\/api\/memos\/([^/]+)$/);
  if (m) {
    const id = parseId(m[1]);
    if (id === null) return sendJson(res, 400, { error: 'invalid id' });

    if (method === 'PATCH') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: 'invalid json' });
      }
      // 전달된 필드만 갱신 (title, content)
      const sets = [];
      const vals = [];
      let i = 1;
      if (typeof body.title === 'string') {
        sets.push(`title = $${i++}`);
        vals.push(body.title);
      }
      if (typeof body.content === 'string') {
        sets.push(`content = $${i++}`);
        vals.push(body.content);
      }
      if (sets.length === 0) {
        return sendJson(res, 400, { error: 'nothing to update' });
      }
      sets.push(`updated_at = now()`);
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE memos SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (rows.length === 0) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, toMemo(rows[0]));
    }

    if (method === 'DELETE') {
      const { rowCount } = await pool.query('DELETE FROM memos WHERE id = $1', [id]);
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
      console.log(`메모장(DB) 서버 실행 중 → http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err);
    process.exit(1);
  });
