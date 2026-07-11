// ============================================================
// 토스페이먼츠 결제 승인(confirm) — Vercel 서버리스 함수 (Node 18+, 무의존성)
// ------------------------------------------------------------
//  · 시크릿키는 절대 클라이언트에 노출하지 않는다 → Vercel 환경변수 TOSS_SECRET_KEY 로만 주입.
//  · 금액 위변조 방지: 결제 요청 전에 클라이언트가 orders 테이블에 저장한
//    "신뢰 금액"을, 사용자 accessToken(RLS)으로 다시 읽어 클라이언트가 보낸 amount와 대조한다.
//    → 저장 금액과 일치할 때만 토스 confirm 을 호출한다.
//  · 승인 성공 시 orders.status='DONE' 갱신 + 해당 사용자 장바구니 비우기(모두 RLS 로 본인 것만).
//
//  요청 body : { paymentKey, orderId, amount, accessToken }
//  응답      : 200 { ok:true, ... } | 4xx/5xx { ok:false, code, message }
// ============================================================

// 공개값(비밀 아님) — index.html 에도 그대로 노출되어 있는 값
const SUPABASE_URL = 'https://ifrydgoofjalfufcpxka.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lpU174Ykn1vPFv9fmUJfxQ_tviU0Xa4';
const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

// Vercel Node 런타임은 보통 JSON body 를 파싱해 주지만, 안전하게 폴백까지 둔다.
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function send(res, status, obj) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' });
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return send(res, 500, { ok: false, code: 'SERVER_MISCONFIGURED', message: 'TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.' });
  }

  let body;
  try { body = await readJson(req); } catch { body = {}; }
  const { paymentKey, orderId, accessToken } = body || {};
  const amount = Number(body && body.amount);

  if (!paymentKey || !orderId || !Number.isFinite(amount) || !accessToken) {
    return send(res, 400, { ok: false, code: 'INVALID_REQUEST', message: 'paymentKey, orderId, amount, accessToken 가 모두 필요합니다.' });
  }

  const authHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };

  // 1) 사용자 토큰(RLS)으로 저장된 신뢰 주문을 조회 → 저장 금액 확인
  let order;
  try {
    const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}&select=order_id,amount,status,user_id`;
    const r = await fetch(url, { headers: authHeaders });
    if (!r.ok) {
      const t = await r.text();
      return send(res, 401, { ok: false, code: 'ORDER_LOOKUP_FAILED', message: `주문 조회 실패(${r.status}): ${t.slice(0, 200)}` });
    }
    const rows = await r.json();
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return send(res, 502, { ok: false, code: 'ORDER_LOOKUP_ERROR', message: String(e && e.message || e) });
  }

  if (!order) {
    return send(res, 400, { ok: false, code: 'ORDER_NOT_FOUND', message: '해당 주문을 찾을 수 없습니다. (본인 주문이 아니거나 존재하지 않음)' });
  }

  // 이미 승인 완료된 주문 → 재confirm 방지(멱등 처리). 새로고침/중복 호출 안전.
  if (order.status === 'DONE') {
    return send(res, 200, { ok: true, already: true, orderId, amount: order.amount, status: 'DONE', message: '이미 승인 완료된 주문입니다.' });
  }

  // ★ 핵심: 저장된 신뢰 금액과 클라이언트가 보낸 금액이 일치할 때만 승인 진행
  if (Number(order.amount) !== amount) {
    return send(res, 400, {
      ok: false, code: 'AMOUNT_MISMATCH',
      message: `금액 불일치: 저장 ${order.amount}원 vs 요청 ${amount}원. 승인을 거부합니다.`,
    });
  }

  // 2) 토스 결제 승인 (시크릿키는 서버에서만 사용)
  let payment, confirmStatus;
  try {
    const encoded = Buffer.from(secretKey + ':').toString('base64');
    const r = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    confirmStatus = r.status;
    payment = await r.json();
    if (!r.ok) {
      // 승인 실패 → 주문 상태 FAILED 로 기록(베스트에포트)
      patchOrder(orderId, { status: 'FAILED' }, authHeaders).catch(() => {});
      return send(res, 400, { ok: false, code: payment.code || 'CONFIRM_FAILED', message: payment.message || '토스 결제 승인에 실패했습니다.' });
    }
  } catch (e) {
    return send(res, 502, { ok: false, code: 'CONFIRM_ERROR', message: String(e && e.message || e) });
  }

  // 3) 승인 성공 → 주문 DONE 처리(+결제시각 paid_at) + 장바구니 비우기 (모두 사용자 토큰=RLS, 베스트에포트)
  const paidAt = payment.approvedAt || new Date().toISOString();
  await patchOrder(orderId, { status: 'DONE', paid_at: paidAt }, authHeaders).catch(() => {});
  try {
    // RLS 로 본인 cart 만 삭제됨. PostgREST 는 필터가 있어야 DELETE 허용 → id>0 (전체) 사용.
    await fetch(`${SUPABASE_URL}/rest/v1/cart?id=gt.0`, {
      method: 'DELETE',
      headers: { ...authHeaders, Prefer: 'return=minimal' },
    });
  } catch { /* 결제는 이미 승인됨 — 장바구니 정리는 실패해도 성공 응답 */ }

  return send(res, 200, {
    ok: true,
    orderId,
    amount,
    orderName: payment.orderName,
    method: payment.method,
    approvedAt: payment.approvedAt,
    paidAt,
    status: 'DONE',
  });
};

async function patchOrder(orderId, patch, authHeaders) {
  return fetch(`${SUPABASE_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}
