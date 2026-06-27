// /api/memos/{id}  — 수정(PATCH) / 삭제(DELETE)
// vercel.json 의 라우트가 id 를 쿼리스트링(?id=) 으로 전달한다.
const { getPool, ensureInit, toMemo, getBody } = require('./_db');

module.exports = async (req, res) => {
  try {
    await ensureInit();
    const pool = getPool();

    const idStr = req.query.id;
    const id = /^\d+$/.test(idStr) ? parseInt(idStr, 10) : null;
    if (id === null) return res.status(400).json({ error: 'invalid id' });

    if (req.method === 'PATCH') {
      const body = getBody(req);
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
        return res.status(400).json({ error: 'nothing to update' });
      }
      sets.push('updated_at = now()');
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE memos SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      return res.status(200).json(toMemo(rows[0]));
    }

    if (req.method === 'DELETE') {
      const { rowCount } = await pool.query('DELETE FROM memos WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
