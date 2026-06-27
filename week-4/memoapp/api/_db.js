// Vercel 서버리스 함수들이 공유하는 DB 헬퍼.
// 파일명이 '_' 로 시작하면 Vercel 이 라우트(함수)로 취급하지 않는다.
const { Pool } = require('pg');

let pool;
// 웜 컨테이너에서 풀을 재사용 (콜드스타트마다 1회 생성)
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('환경변수 DATABASE_URL 이 설정되지 않았습니다.');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

let initPromise;
// 테이블 생성을 컨테이너당 1회만 보장
function ensureInit() {
  if (!initPromise) {
    initPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS memos (
        id         SERIAL PRIMARY KEY,
        title      TEXT        NOT NULL DEFAULT '',
        content    TEXT        NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }
  return initPromise;
}

// DB row -> API 응답 형태
function toMemo(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Vercel 은 보통 req.body 를 파싱해주지만, 문자열로 오는 경우도 방어
function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

module.exports = { getPool, ensureInit, toMemo, getBody };
