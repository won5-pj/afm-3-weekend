// POST /api/login  { id, pw } → { token }  (사장님 자격 확인)
const { login, readBody, sendJson } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
  try {
    const { id, pw } = await readBody(req);
    const token = login(id, pw);
    if (!token) return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    sendJson(res, 200, { token, expiresIn: 43200 });
  } catch (e) {
    sendJson(res, 500, { error: '로그인 처리 실패' });
  }
};
