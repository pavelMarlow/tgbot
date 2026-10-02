-- ParoHod 2.5: new isolated tables. Do not remove products or product_photos.
CREATE TABLE IF NOT EXISTS app_visitors (
 telegram_id TEXT PRIMARY KEY,
 first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 visits INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS app_visitors_first_seen ON app_visitors(first_seen);
CREATE INDEX IF NOT EXISTS app_visitors_last_seen ON app_visitors(last_seen);
CREATE TABLE IF NOT EXISTS availability_inquiries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 telegram_id TEXT NOT NULL,
 item_count INTEGER NOT NULL,
 delivered_count INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inquiry_user_time ON availability_inquiries(telegram_id,created_at);
