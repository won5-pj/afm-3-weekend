// GET /api/weather — 청라 날씨 + 손님 수 예측 (OpenWeatherMap)
const { getWeather, sendJson, checkAuth } = require('./_lib');

module.exports = async (req, res) => {
  if (!checkAuth(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    const weather = await getWeather();
    sendJson(res, 200, weather);
  } catch (e) {
    console.error('[weather]', e);
    sendJson(res, 500, { error: '날씨 조회 실패: ' + e.message });
  }
};
