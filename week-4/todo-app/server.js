// =============================================================
// Todo App - Node.js 내장 모듈만 사용한 백엔드 서버 (server.js)
// 외부 npm 패키지 없이 http, fs, path 만 사용
// =============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// ----- 설정 -----
const PORT = process.env.PORT || 3000;
const ROOT = __dirname; // todo-app 폴더

// ----- 유틸: todo-*.txt 파일 한 개를 파싱 -----
function parseTodoFile(fileName, content) {
  const id = fileName.replace(/\.txt$/i, ''); // 확장자 제거 → "todo-1"

  // 줄 단위로 분리 (CRLF/CR/LF 모두 대응)
  const lines = content.split(/\r\n|\r|\n/);
  const firstLine = (lines[0] || '').trim();

  // 체크박스 상태: [x] 면 done=true (대소문자 무시)
  const done = /^\[\s*x\s*\]/i.test(firstLine);

  // 제목: 맨 앞 체크박스 표시([ ] 또는 [x]) 제거 후 trim
  const title = firstLine.replace(/^\[\s*[xX ]?\s*\]\s*/, '').trim();

  // 마감 / 우선순위 추출 (없으면 빈 문자열)
  let due = '';
  let priority = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const dueMatch = line.match(/^-\s*마감\s*:\s*(.*)$/);
    const prioMatch = line.match(/^-\s*우선순위\s*:\s*(.*)$/);
    if (dueMatch) due = dueMatch[1].trim();
    if (prioMatch) priority = prioMatch[1].trim();
  }

  return { id, done, title, due, priority };
}

// ----- 유틸: 폴더의 모든 todo-*.txt 를 읽어서 파싱 (매번 새로 읽음, 캐시 없음) -----
function readAllTodos() {
  const files = fs
    .readdirSync(ROOT)
    .filter((name) => /^todo-.*\.txt$/i.test(name));

  // 파일명 순으로 정렬 (todo-1, todo-2, ... 자연스러운 숫자 순서)
  files.sort((a, b) => {
    const numA = parseInt((a.match(/\d+/) || ['0'])[0], 10);
    const numB = parseInt((b.match(/\d+/) || ['0'])[0], 10);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });

  return files.map((name) => {
    const content = fs.readFileSync(path.join(ROOT, name), 'utf-8');
    return parseTodoFile(name, content);
  });
}

// ----- 유틸: 다음 todo 번호 계산 (기존 최대 번호 + 1, 없으면 1) -----
function getNextTodoNumber() {
  const files = fs
    .readdirSync(ROOT)
    .filter((name) => /^todo-\d+\.txt$/i.test(name));
  let max = 0;
  for (const name of files) {
    const n = parseInt((name.match(/\d+/) || ['0'])[0], 10);
    if (n > max) max = n;
  }
  return max + 1;
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

// ----- 유틸: JSON 응답 헬퍼 -----
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
      const todos = readAllTodos();
      sendJson(res, 200, todos);
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

          // 새 파일 번호 및 id
          const num = getNextTodoNumber();
          const id = `todo-${num}`;
          const fileName = `${id}.txt`;
          const filePath = path.join(ROOT, fileName);

          // 기존 형식과 동일하게 파일 작성
          const fileContent =
            `[ ] ${title}\n` +
            `- 마감: ${due}\n` +
            `- 우선순위: ${priority}\n`;

          fs.writeFileSync(filePath, fileContent, 'utf-8');

          // 생성된 항목을 GET 과 동일한 형태로 반환
          sendJson(res, 201, { id, done: false, title, due, priority });
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

      // 보안: id 는 반드시 todo-숫자 형태만 허용 (경로 탈출 방지)
      if (!/^todo-\d+$/.test(id)) {
        sendJson(res, 400, {
          success: false,
          message: '잘못된 id 형식입니다.',
        });
        return;
      }

      const filePath = path.join(ROOT, `${id}.txt`);

      // 파일 존재 확인
      if (!fs.existsSync(filePath)) {
        sendJson(res, 404, {
          success: false,
          message: '해당 할 일을 찾을 수 없습니다.',
        });
        return;
      }

      fs.unlinkSync(filePath);
      sendJson(res, 200, { ok: true });
      return;
    }

    // ===== API: PATCH /api/todos/{id} (완료 상태 토글 저장) =====
    if (urlPath.startsWith('/api/todos/') && req.method === 'PATCH') {
      const id = urlPath.slice('/api/todos/'.length);

      // 보안: id 는 반드시 todo-숫자 형태만 허용 (경로 탈출 방지)
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

          const filePath = path.join(ROOT, `${id}.txt`);

          // 파일 존재 확인
          if (!fs.existsSync(filePath)) {
            sendJson(res, 404, {
              success: false,
              message: '해당 할 일을 찾을 수 없습니다.',
            });
            return;
          }

          const content = fs.readFileSync(filePath, 'utf-8');

          // 줄바꿈 형식 보존: 첫 줄과 첫 줄바꿈 문자만 분리
          const nlMatch = content.match(/\r\n|\r|\n/); // 첫 줄바꿈
          const firstNlIndex = nlMatch ? content.indexOf(nlMatch[0]) : -1;
          const firstLine =
            firstNlIndex === -1 ? content : content.slice(0, firstNlIndex);
          const rest = firstNlIndex === -1 ? '' : content.slice(firstNlIndex); // 줄바꿈 포함 나머지 보존

          // 첫 줄에서 기존 제목 추출 (체크박스 표시 제거)
          const title = firstLine
            .replace(/^\[\s*[xX ]?\s*\]\s*/, '')
            .trim();

          // 새 체크박스로 첫 줄만 교체
          const newFirstLine = `${body.done ? '[x]' : '[ ]'} ${title}`;
          const newContent = newFirstLine + rest;

          fs.writeFileSync(filePath, newContent, 'utf-8');

          // 갱신된 항목을 GET 과 동일한 형태로 반환 (파일 재파싱)
          const updated = parseTodoFile(`${id}.txt`, newContent);
          sendJson(res, 200, updated);
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

      // 비밀 파일(.env 등 dotfile) 노출 방지
      if (path.basename(filePath).startsWith('.')) {
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
