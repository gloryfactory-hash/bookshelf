-- 방명록 (2026-11-19). npx wrangler d1 execute <DB 이름> --file db/guestbook.sql
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,          -- public | held | removed
  reason TEXT,                   -- 보류된 까닭
  reply TEXT,
  reply_by TEXT,
  ip TEXT,                       -- 주소를 그대로 두지 않고 해시만
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_status ON entries(site, status, created_at);
