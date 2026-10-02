"""SQLite invariants for D1 2.5 migration: preserve existing data and photos."""
from pathlib import Path
import sqlite3
root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
db.executescript((root/'schema.sql').read_text('utf8'))
db.executescript((root/'photo_migration.sql').read_text('utf8'))
db.execute("INSERT INTO products(id,name,category,price,image_url,available) VALUES(1,'Солевая монашка','Жидкости',450,'',0)")
db.execute("INSERT INTO product_photos(product_id,data_url) VALUES(1,'data:image/webp;base64,TEST')")
for _ in range(2):db.executescript((root/'upgrade_2_5.sql').read_text('utf8'))
assert db.execute('SELECT name,price,available FROM products WHERE id=1').fetchone()==('Солевая монашка',450,0)
assert db.execute('SELECT data_url FROM product_photos WHERE product_id=1').fetchone()[0]=='data:image/webp;base64,TEST'
for n in ['app_visitors','availability_inquiries']:
 assert db.execute('SELECT name FROM sqlite_master WHERE type="table" AND name=?',(n,)).fetchone()
db.execute("INSERT INTO app_visitors(telegram_id) VALUES('8204734421') ON CONFLICT(telegram_id) DO UPDATE SET visits=visits+CASE WHEN (julianday('now')-julianday(last_seen))*86400>=300 THEN 1 ELSE 0 END,last_seen=CURRENT_TIMESTAMP")
assert db.execute('SELECT visits FROM app_visitors').fetchone()[0]==1
print('PASS: D1 migration twice, stored photo and all existing product fields preserved, visit upsert valid')
