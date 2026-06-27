// /api/memos  — 목록 조회(GET) / 생성(POST)
const { getPool, ensureInit, toMemo, getBody } = require('./_db');

module.exports = async (req, res) => {
  try {
    await ensureInit();
    const pool = getPool();

    // GET /api/memos — 최근 수정순
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT * FROM memos ORDER BY updated_at DESC, id DESC'
      );
      return res.status(200).json(rows.map(toMemo));
    }

    // POST /api/memos
    if (req.method === 'POST') {
      const body = getBody(req);
      const title = typeof body.title === 'string' ? body.title : '';
      const content = typeof body.content === 'string' ? body.content : '';
      const { rows } = await pool.query(
        'INSERT INTO memos (title, content) VALUES ($1, $2) RETURNING *',
        [title, content]
      );
      return res.status(201).json(toMemo(rows[0]));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
