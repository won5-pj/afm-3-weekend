// /api/todos — 카페 할일/발주 (Notion 연동)
//
//   GET   → 할일 목록
//   POST  { id, done } → 완료 토글
//
// 데이터 원본은 Notion 데이터베이스("🐶 멍스데이 카페 · 할일/발주").
// NOTION_TOKEN(+ NOTION_DB_ID / NOTION_DATA_SOURCE_ID)이 설정되면 Notion에서
// 실시간으로 읽고 쓰며(체크 토글이 Notion 페이지에 반영), 없으면 Supabase
// 미러(cafe_todos)에서 읽고 씁니다.
const { getPool, sendJson, checkAuth, readBody } = require('./_lib');

const NOTION_VER_DS = '2025-09-03'; // data sources API
const NOTION_VER_DB = '2022-06-28'; // classic databases API

function notionHeaders(ver) {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': ver,
    'Content-Type': 'application/json',
  };
}

function mapNotionRow(p) {
  const props = p.properties || {};
  const pick = (n) => props[n] || {};
  return {
    id: p.id,
    title: (pick('할일').title || []).map((t) => t.plain_text).join(''),
    done: !!pick('완료').checkbox,
    category: pick('분류').select?.name || '운영',
    sort_order: pick('순서').number ?? 0,
    memo: (pick('메모').rich_text || []).map((t) => t.plain_text).join(''),
    source: 'notion',
  };
}

// Read live from Notion. Tries the data-sources API first (newer DBs), then the
// classic databases API. Returns null if no token/ids configured.
async function readFromNotion() {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;
  const dsId = process.env.NOTION_DATA_SOURCE_ID;
  if (!token || (!dbId && !dsId)) return null;

  const attempts = [];
  if (dsId) attempts.push({ url: `https://api.notion.com/v1/data_sources/${dsId}/query`, ver: NOTION_VER_DS });
  if (dbId) attempts.push({ url: `https://api.notion.com/v1/databases/${dbId}/query`, ver: NOTION_VER_DB });

  let lastErr;
  for (const a of attempts) {
    try {
      const r = await fetch(a.url, { method: 'POST', headers: notionHeaders(a.ver), body: JSON.stringify({ page_size: 50 }) });
      if (!r.ok) { lastErr = new Error(`notion ${r.status}: ${(await r.text()).slice(0, 140)}`); continue; }
      const data = await r.json();
      const rows = (data.results || []).map(mapNotionRow);
      rows.sort((a, b) => a.sort_order - b.sort_order);
      return rows;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('notion query failed');
}

async function updateNotionCheckbox(pageId, done) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(NOTION_VER_DB),
    body: JSON.stringify({ properties: { '완료': { checkbox: done } } }),
  });
  if (!r.ok) throw new Error(`notion update ${r.status}: ${(await r.text()).slice(0, 140)}`);
}

async function readFromSupabase() {
  const rows = (await getPool().query(
    `select id, title, done, category, sort_order from public.cafe_todos order by sort_order`
  )).rows;
  return rows.map((r) => ({ ...r, id: Number(r.id), source: 'supabase' }));
}

const isNotionId = (v) => typeof v === 'string' && /^[0-9a-f-]{32,36}$/i.test(v);

module.exports = async (req, res) => {
  if (!checkAuth(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      const done = body.done === true || body.done === 'true';

      // Notion page id → update the Notion checkbox (live sync)
      if (isNotionId(body.id) && process.env.NOTION_TOKEN) {
        await updateNotionCheckbox(body.id, done);
        return sendJson(res, 200, { ok: true, id: body.id, done, source: 'notion' });
      }

      // else Supabase mirror (validated int + boolean literal → pgBouncer-safe)
      const id = parseInt(body.id, 10);
      if (!Number.isInteger(id)) return sendJson(res, 400, { error: 'invalid id' });
      await getPool().query(`update public.cafe_todos set done = ${done} where id = ${id}`);
      return sendJson(res, 200, { ok: true, id, done, source: 'supabase' });
    }

    let todos = null;
    let source = 'supabase';
    try {
      todos = await readFromNotion(); // null if no token configured
      if (todos) source = 'notion';
    } catch (e) {
      console.warn('[todos] notion fallback:', e.message);
    }
    if (!todos) todos = await readFromSupabase();

    sendJson(res, 200, { todos, source, connected: 'Notion', mirror: 'Supabase' });
  } catch (e) {
    console.error('[todos]', e);
    sendJson(res, 500, { error: '할일 조회 실패: ' + e.message });
  }
};
