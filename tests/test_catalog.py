import sqlite3, csv, json, pathlib
from collections import Counter
p=pathlib.Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
db.executescript((p/'schema.sql').read_text(encoding='utf-8'))
db.execute("insert into products(name,category,price,description,image_url,available,published) values('Xros 6','Устройства',9999,'EDITED','https://example.com/actual.jpg',1,1)")
seed=(p/'catalog_21.sql').read_text(encoding='utf-8')
db.executescript(seed)
rows=db.execute('select name,category,price,image_url,available from products').fetchall()
assert len(rows)==21, len(rows)
assert Counter(r[1] for r in rows)=={'Жидкости':8,'Расходники':4,'Устройства':9}
assert [r for r in rows if r[0]=='Xros 6'][0]==('Xros 6','Устройства',9999,'https://example.com/actual.jpg',1)
assert all(r[4]==0 for r in rows if r[0]!='Xros 6')
db.executescript(seed)
assert db.execute('select count(*) from products').fetchone()[0]==21
with (p/'catalog_21.csv').open(encoding='utf-8-sig',newline='') as f: csv_rows=list(csv.DictReader(f))
assert len(csv_rows)==21
assert {r['name']:int(r['price']) for r in csv_rows}=={r['name']:r['price'] for r in json.loads((p/'public/catalog-preview.json').read_text())}
for name,cat,price in db.execute('select name,category,price from products where name!=?',('Xros 6',)):
    assert int(next(r['price'] for r in csv_rows if r['name']==name))==price
print('PASS: 21 unique products; 8 liquids, 4 cartridges, 9 devices; prices and CSV/JSON agree; idempotent SQL; existing edits preserved; availability not fabricated')
