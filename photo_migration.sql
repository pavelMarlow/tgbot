-- ParoHod 2.2: safe optional photo storage for compressed JPEG/WebP files.
-- This does not alter or erase products. It is idempotent.
CREATE TABLE IF NOT EXISTS product_photos (
  product_id INTEGER PRIMARY KEY,
  data_url TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
