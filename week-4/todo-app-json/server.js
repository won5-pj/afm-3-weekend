// =============================================================
// Todo App - Node.js 내장 모듈만 사용한 백엔드 서버 (server.js)
// 저장소: todos.json 파일 하나 (txt 파일 방식에서 전환)
// 외부 npm 패키지 없이 http, fs, path 만 사용
// =============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// ----- 설정 -----
const PORT = process.env.PORT || 3000;
const ROOT = __dirname; // todo-app-json 폴더
const DATA_FILE = path.join(ROOT, 'todos.json');

// ----- 데이터 헬퍼: todos.json 읽기 (매번 새로 읽음, 캐시 없음) -----
// 파일이 없거나 비어있거나 깨졌으면 { seq: 0, todos: [] } 로 안전하게 반환
function readData() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf-8');
  } catch (e) {
    // 파일이 없는 경우 등
    return { seq: 0, todos: [] };
  }

  if (!raw || !raw.trim()) {
    return { seq: 0, todos: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // 깨진 JSON
    return { seq: 0, todos: [] };
  }

  // 구조 방어: seq 는 숫자, todos 는 배열로 정규화
  const seq = typeof parsed.seq === 'number' && parsed.seq >= 0 ? parsed.seq : 0;
  const todos = Array.isArray(parsed.todos) ? parsed.todos : [];
  return { seq, todos };
}

// ----- 데이터 헬퍼: todos.json 쓰기 (사람이 읽기 좋게 2칸 들여쓰기) -----
function writeData(data) {
  const safe = {
    seq: typeof data.seq === 'number' && data.seq >= 0 ? data.seq : 0,
    todos: Array.isArray(data.todos) ? data.todos : [],
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(safe, null, 2), 'utf-8');
}

// ----- 유틸: 요청 body 를 JSON 으로 파싱 (직접 구현) -----
function readJsonBody(req, callback) {
  let raw = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    raw += chunk;
    // 과도하게 큰 body 방어 (1MB 제한)
    if (raw.length > 1e6) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on('end', () => {
    if (tooLarge) {
      callback(new Error('Payload too large'), null);
      return;
    }
    if (!raw.trim()) {
      // 빈 body 는 빈 객체로 처리
      callback(null, {});
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      callback(null, parsed);
    } catch (e) {
      callback(e, null); // 잘못된 JSON
    }
  });
  req.on('error', (e) => callback(e, null));
}

// ----- 유틸: 정적 파일 MIME 타입 -----
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return map[ext] || 'application/octet-stream';
}

// ----- 유틸: JSON 응답 헬퍼 (charset=utf-8) -----
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

// ----- 서버 -----
const server = http.createServer((req, res) => {
  try {
    // URL 에서 경로만 추출 (쿼리스트링 제거)
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    // ===== API: GET /api/todos =====
    if (urlPath === '/api/todos' && req.method === 'GET') {
      const { todos } = readData();
      // 각 항목을 { id, done, title, due, priority } 형태로 반환
      const result = todos.map((t) => ({
        id: t.id,
        done: !!t.done,
        title: typeof t.title === 'string' ? t.title : '',
        due: typeof t.due === 'string' ? t.due : '',
        priority: typeof t.priority === 'string' ? t.priority : '',
      }));
      sendJson(res, 200, result);
      return;
    }

    // ===== API: POST /api/todos (새 할 일 추가) =====
    if (urlPath === '/api/todos' && req.method === 'POST') {
      readJsonBody(req, (err, body) => {
        try {
          if (err) {
            sendJson(res, 400, {
              success: false,
              message: 'Invalid JSON body',
            });
            return;
          }

          const title = (body && typeof body.title === 'string'
            ? body.title
            : ''
          ).trim();

          // title 필수
          if (!title) {
            sendJson(res, 400, {
              success: false,
              message: 'title은 필수입니다.',
            });
            return;
          }

          const due = (body && typeof body.due === 'string' ? body.due : '').trim();
          const priority = (body && typeof body.priority === 'string'
            ? body.priority
            : ''
          ).trim() || '보통'; // 기본값

          // 데이터 읽기 → seq 증가 → 새 항목 추가 → 저장
          const data = readData();
          const newSeq = data.seq + 1;
          const id = `todo-${newSeq}`;
          const newTodo = { id, done: false, title, due, priority };

          data.seq = newSeq;
          data.todos.push(newTodo);
          writeData(data);

          // 생성된 항목을 GET 과 동일한 형태로 반환
          sendJson(res, 201, newTodo);
        } catch (e) {
          sendJson(res, 500, {
            success: false,
            message: 'Internal Server Error',
          });
        }
      });
      return;
    }

    // ===== API: DELETE /api/todos/{id} (할 일 삭제) =====
    if (urlPath.startsWith('/api/todos/') && req.method === 'DELETE') {
      const id = urlPath.slice('/api/todos/'.length);

      // id 는 반드시 todo-숫자 형태만 허용
      if (!/^todo-\d+$/.test(id)) {
        sendJson(res, 400, {
          success: false,
          message: '잘못된 id 형식입니다.',
        });
        return;
      }

      const data = readData();
      const index = data.todos.findIndex((t) => t.id === id);

      if (index === -1) {
        sendJson(res, 404, {
          success: false,
          message: '해당 할 일을 찾을 수 없습니다.',
        });
        return;
      }

      data.todos.splice(index, 1);
      writeData(data);
      sendJson(res, 200, { ok: true });
      return;
    }

    // ===== API: PATCH /api/todos/{id} (완료 상태 토글 저장) =====
    if (urlPath.startsWith('/api/todos/') && req.method === 'PATCH') {
      const id = urlPath.slice('/api/todos/'.length);

      // id 는 반드시 todo-숫자 형태만 허용
      if (!/^todo-\d+$/.test(id)) {
        sendJson(res, 400, {
          success: false,
          message: '잘못된 id 형식입니다.',
        });
        return;
      }

      readJsonBody(req, (err, body) => {
        try {
          if (err) {
            sendJson(res, 400, {
              success: false,
              message: 'Invalid JSON body',
            });
            return;
          }

          // done 은 반드시 boolean
          if (!body || typeof body.done !== 'boolean') {
            sendJson(res, 400, {
              success: false,
              message: 'done 은 boolean 이어야 합니다.',
            });
            return;
          }

          const data = readData();
          const todo = data.todos.find((t) => t.id === id);

          if (!todo) {
            sendJson(res, 404, {
              success: false,
              message: '해당 할 일을 찾을 수 없습니다.',
            });
            return;
          }

          todo.done = body.done;
          writeData(data);

          // 갱신된 항목을 GET 과 동일한 형태로 반환
          sendJson(res, 200, {
            id: todo.id,
            done: !!todo.done,
            title: typeof todo.title === 'string' ? todo.title : '',
            due: typeof todo.due === 'string' ? todo.due : '',
            priority: typeof todo.priority === 'string' ? todo.priority : '',
          });
        } catch (e) {
          sendJson(res, 500, {
            success: false,
            message: 'Internal Server Error',
          });
        }
      });
      return;
    }

    // ===== 정적 파일 서빙 =====
    if (req.method === 'GET') {
      // 루트(/) 는 index.html 로
      let relativePath = urlPath === '/' ? '/index.html' : urlPath;

      // 디렉터리 탈출 방지 (../ 차단)
      const safePath = path
        .normalize(relativePath)
        .replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(ROOT, safePath);

      // ROOT 밖으로 벗어나지 못하도록 확인
      if (!filePath.startsWith(ROOT)) {
        sendJson(res, 403, { success: false, message: 'Forbidden' });
        return;
      }

      // 비밀/숨김 파일(.env 등 dotfile) 노출 방지 (경로 모든 세그먼트 검사)
      const hasDotSegment = safePath
        .split(/[/\\]/)
        .some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..');
      if (hasDotSegment) {
        sendJson(res, 403, { success: false, message: 'Forbidden' });
        return;
      }

      fs.readFile(filePath, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('500 Internal Server Error');
          }
          return;
        }
        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
        res.end(content);
      });
      return;
    }

    // ===== 그 외 메서드/경로 =====
    sendJson(res, 404, { success: false, message: 'Not Found' });
  } catch (err) {
    // 어떤 에러가 나도 서버가 죽지 않도록
    sendJson(res, 500, {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`Todo 서버 실행 중 → http://localhost:${PORT}`);
});
