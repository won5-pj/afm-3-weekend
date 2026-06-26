const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
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

const WEATHER_BASE = 'https://api.openweathermap.org/data/2.5';

// --- API 키 로딩: process.env 우선, 없으면 같은 폴더의 .env 직접 파싱 (의존성 없음) ---
function loadApiKey() {
  if (process.env.WEATHER_API_KEY) return process.env.WEATHER_API_KEY.trim();
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'WEATHER_API_KEY') continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.trim();
    }
  } catch (_e) {
    // .env 없음
  }
  return '';
}

const WEATHER_API_KEY = loadApiKey();
if (!WEATHER_API_KEY) {
  console.warn('[WARN] WEATHER_API_KEY 가 없습니다. /recommend 호출 시 500을 반환합니다. (.env 또는 환경변수 확인)');
}

// --- 기온 구간별 옷차림 가공 규칙 ---
// 한국 기상청/패션 가이드에서 흔히 쓰는 "기온별 옷차림" 8단계를 기준으로 삼는다.
// 각 구간은 하한(min) 임계값만 가지며 높은 값부터 정렬하여 빈틈 없이 매칭한다.
// (예: 23 이상 28 미만이면 '여름' 구간)
const OUTFIT_BANDS = [
  {
    min: 28,
    level: '한여름',
    headline: '반팔·반바지 OK! 🥵',
    emoji: '🥵',
    items: ['민소매', '반팔티', '반바지', '린넨 셔츠', '원피스'],
    tip: '땀이 많이 나니 통풍 잘 되는 옷을 입고 수분을 자주 보충하세요.',
  },
  {
    min: 23,
    level: '여름',
    headline: '가볍게 반팔이면 충분해요 ☀️',
    emoji: '☀️',
    items: ['반팔티', '얇은 셔츠', '반바지', '면바지', '치마'],
    tip: '한낮엔 덥지만 실내 냉방이 셀 수 있으니 얇은 겉옷 하나 챙기면 좋아요.',
  },
  {
    min: 20,
    level: '초여름·초가을',
    headline: '얇은 긴팔이 딱 좋아요 🙂',
    emoji: '🍃',
    items: ['얇은 가디건', '긴팔티', '면바지', '청바지', '얇은 니트'],
    tip: '일교차가 있을 수 있으니 가벼운 가디건을 더해 보세요.',
  },
  {
    min: 17,
    level: '선선함',
    headline: '얇은 니트·맨투맨 시즌 🍂',
    emoji: '🍂',
    items: ['얇은 니트', '맨투맨', '가디건', '청바지', '면바지'],
    tip: '아침저녁으로 쌀쌀하니 겉옷을 챙기는 걸 추천해요.',
  },
  {
    min: 12,
    level: '쌀쌀함',
    headline: '자켓·가디건 챙기세요 🧥',
    emoji: '🧥',
    items: ['자켓', '가디건', '야상', '얇은 코트', '청바지'],
    tip: '바람이 불면 더 춥게 느껴져요. 겉옷을 꼭 챙기세요.',
  },
  {
    min: 9,
    level: '추위 시작',
    headline: '트렌치코트·점퍼가 필요해요 🌬️',
    emoji: '🌬️',
    items: ['트렌치코트', '점퍼', '야상', '니트', '스타킹'],
    tip: '본격적으로 추워지는 구간이에요. 목까지 덮이는 옷이 따뜻해요.',
  },
  {
    min: 5,
    level: '추움',
    headline: '코트·히트텍 단단히! 🧣',
    emoji: '🧣',
    items: ['코트', '가죽자켓', '히트텍', '두꺼운 니트', '스카프'],
    tip: '속에 발열내의(히트텍)를 받쳐 입으면 훨씬 따뜻해요.',
  },
  {
    min: -Infinity,
    level: '한겨울',
    headline: '패딩 필수! 🧥❄️',
    emoji: '❄️',
    items: ['패딩', '두꺼운 코트', '목도리', '장갑', '기모 바지'],
    tip: '동상 주의! 장갑·목도리로 노출 부위를 최대한 줄이세요.',
  },
];

function pickBand(temp) {
  // 높은 임계값부터 검사 → temp 이상인 첫 구간이 정답 (빈틈 없음)
  return OUTFIT_BANDS.find((b) => temp >= b.min) || OUTFIT_BANDS[OUTFIT_BANDS.length - 1];
}

// 날씨 상태(비/눈/바람 등)에 따른 추가 코디 조언
function weatherExtras(weather) {
  const extras = [];
  const main = (weather.main || '').toLowerCase();   // Rain, Snow, Clouds ...
  const id = weather.id || 0;
  const windSpeed = weather.windSpeed || 0;

  if (main === 'rain' || main === 'drizzle' || (id >= 200 && id < 600)) {
    extras.push('☔ 비 소식이 있어요. 우산과 방수 외투를 챙기세요.');
  }
  if (main === 'snow' || (id >= 600 && id < 700)) {
    extras.push('☃️ 눈이 와요. 미끄럼 방지 신발과 방한용품을 준비하세요.');
  }
  if (windSpeed >= 8) {
    extras.push('💨 바람이 강해요. 체감온도가 더 낮으니 바람막이를 추천해요.');
  }
  return extras;
}

// --- 한글 도시명 → OpenWeatherMap 영문명 변환 ---
// OpenWeatherMap의 q= 검색은 한글을 인식하지 못해 "Nothing to geocode" 오류가 난다.
// 사용자가 한글로 입력해도 동작하도록 주요 도시를 영문(+국가코드)으로 매핑한다.
const CITY_ALIAS = {
  // 국내 주요 도시
  '서울': 'Seoul,KR', '부산': 'Busan,KR', '대구': 'Daegu,KR', '인천': 'Incheon,KR',
  '광주': 'Gwangju,KR', '대전': 'Daejeon,KR', '울산': 'Ulsan,KR', '세종': 'Sejong,KR',
  '수원': 'Suwon,KR', '성남': 'Seongnam,KR', '용인': 'Yongin,KR', '고양': 'Goyang,KR',
  '제주': 'Jeju,KR', '제주도': 'Jeju,KR', '춘천': 'Chuncheon,KR', '강릉': 'Gangneung,KR',
  '전주': 'Jeonju,KR', '청주': 'Cheongju,KR', '천안': 'Cheonan,KR', '포항': 'Pohang,KR',
  '창원': 'Changwon,KR', '여수': 'Yeosu,KR', '목포': 'Mokpo,KR', '안산': 'Ansan,KR',
  '안양': 'Anyang,KR', '평택': 'Pyeongtaek,KR', '김해': 'Gimhae,KR', '원주': 'Wonju,KR',
  // 해외 인기 도시
  '도쿄': 'Tokyo,JP', '오사카': 'Osaka,JP', '교토': 'Kyoto,JP', '후쿠오카': 'Fukuoka,JP',
  '삿포로': 'Sapporo,JP', '베이징': 'Beijing,CN', '상하이': 'Shanghai,CN',
  '홍콩': 'Hong Kong,HK', '타이베이': 'Taipei,TW', '방콕': 'Bangkok,TH',
  '싱가포르': 'Singapore,SG', '하노이': 'Hanoi,VN', '다낭': 'Da Nang,VN',
  '뉴욕': 'New York,US', '로스앤젤레스': 'Los Angeles,US', 'la': 'Los Angeles,US',
  '런던': 'London,GB', '파리': 'Paris,FR', '베를린': 'Berlin,DE', '로마': 'Rome,IT',
  '시드니': 'Sydney,AU', '두바이': 'Dubai,AE',
};

// 입력 도시명을 OpenWeatherMap이 인식하는 형태로 정규화
function normalizeCity(input) {
  const key = input.trim().toLowerCase();
  // 한글 별칭 (원문 그대로) 우선 매칭
  if (CITY_ALIAS[input.trim()]) return CITY_ALIAS[input.trim()];
  if (CITY_ALIAS[key]) return CITY_ALIAS[key];
  return input.trim();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// GET /recommend?city=Seoul  또는  /recommend?lat=..&lon=..
async function handleRecommend(req, res, query) {
  if (!WEATHER_API_KEY) {
    return sendJson(res, 500, { error: '서버에 날씨 API 키가 설정되지 않았습니다.' });
  }

  const city = (query.get('city') || '').trim();
  const lat = query.get('lat');
  const lon = query.get('lon');

  let weatherUrl;
  if (lat && lon) {
    weatherUrl = `${WEATHER_BASE}/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
      `&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
  } else if (city) {
    const queryCity = normalizeCity(city);   // 한글 → 영문 변환
    weatherUrl = `${WEATHER_BASE}/weather?q=${encodeURIComponent(queryCity)}` +
      `&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
  } else {
    // 기본값: 서울
    weatherUrl = `${WEATHER_BASE}/weather?q=Seoul` +
      `&appid=${WEATHER_API_KEY}&units=metric&lang=kr`;
  }

  try {
    const apiRes = await fetch(weatherUrl);

    if (!apiRes.ok) {
      let detail = '';
      try {
        const errJson = await apiRes.json();
        detail = (errJson && errJson.message) || '';
      } catch (_e) { /* ignore */ }
      if (apiRes.status === 404 || apiRes.status === 400) {
        const hasKorean = /[가-힣]/.test(city);
        const hint = hasKorean
          ? ' 한글은 일부 주요 도시만 지원해요. 영문 도시명(예: Seoul, Busan)으로 입력해 보세요.'
          : ' 영문 도시명 철자를 확인해 주세요.';
        return sendJson(res, 404, { error: `'${city}' 도시를 찾지 못했어요.${hint}` });
      }
      console.error('[Weather error]', apiRes.status, detail);
      return sendJson(res, 502, { error: `날씨 API 오류 (${apiRes.status})${detail ? ': ' + detail : ''}` });
    }

    const data = await apiRes.json();

    const temp = data.main && typeof data.main.temp === 'number' ? data.main.temp : null;
    const feelsLike = data.main && typeof data.main.feels_like === 'number' ? data.main.feels_like : temp;
    if (temp === null) {
      return sendJson(res, 502, { error: '날씨 데이터를 해석하지 못했습니다.' });
    }

    const w0 = (data.weather && data.weather[0]) || {};
    const weatherInfo = {
      main: w0.main || '',
      id: w0.id || 0,
      description: w0.description || '',
      icon: w0.icon || '',
      windSpeed: (data.wind && data.wind.speed) || 0,
    };

    // 기온 구간 → 옷차림 가공
    const band = pickBand(feelsLike);   // 체감온도 기준으로 추천
    const extras = weatherExtras(weatherInfo);

    const result = {
      location: {
        name: data.name || city || '알 수 없음',
        country: (data.sys && data.sys.country) || '',
        lat: data.coord && data.coord.lat,
        lon: data.coord && data.coord.lon,
      },
      weather: {
        temp: Math.round(temp * 10) / 10,
        feelsLike: Math.round(feelsLike * 10) / 10,
        tempMin: data.main && Math.round(data.main.temp_min * 10) / 10,
        tempMax: data.main && Math.round(data.main.temp_max * 10) / 10,
        humidity: data.main && data.main.humidity,
        windSpeed: weatherInfo.windSpeed,
        description: weatherInfo.description,
        main: weatherInfo.main,
        icon: weatherInfo.icon,
      },
      recommendation: {
        level: band.level,
        headline: band.headline,
        emoji: band.emoji,
        items: band.items,
        tip: band.tip,
        extras,
        // 한 줄 요약 문구
        summary: `체감 ${Math.round(feelsLike)}°C → ${band.headline}`,
      },
    };

    return sendJson(res, 200, result);
  } catch (e) {
    console.error('[Network/Fetch error]', e);
    return sendJson(res, 500, { error: '날씨 API 호출 중 네트워크 오류가 발생했습니다.' });
  }
}

// 정적 파일 서빙
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = parsed.pathname;

  if (urlPath === '/recommend') {
    if (req.method === 'GET') {
      handleRecommend(req, res, parsed.searchParams);
    } else {
      sendJson(res, 405, { error: 'GET 메서드만 허용됩니다.' });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`👕 오늘의 옷차림 추천소가 문을 열었어요! http://localhost:${PORT}/`);
});
