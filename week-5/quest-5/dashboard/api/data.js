// GET /api/data — Supabase 카페 운영 데이터 집계 (매출/메뉴/재고/예약/생일)
const { getCafeData, sendJson, checkAuth } = require('./_lib');

module.exports = async (req, res) => {
  if (!checkAuth(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    const data = await getCafeData();
    sendJson(res, 200, data);
  } catch (e) {
    console.error('[data]', e);
    sendJson(res, 500, { error: 'DB 조회 실패: ' + e.message });
  }
};
