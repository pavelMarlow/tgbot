"""Offline Chromium UI smoke: inline assets + mocked API, no network / Cloudflare account."""
import json,pathlib,re,base64
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
products=json.loads((ROOT/'public/catalog-preview.json').read_text(encoding='utf-8'))
for i,p in enumerate(products,1):p['id']=i
products[0]['image_url']='data:image/png;base64,INVALID'  # Must show honest fallback.
for item in products:
 if item['name'] in ('Грех X ISTERIKA','Rick and Morty Bad Acid','Xros 5 mini','AEGIS BOOST 3 KIT','Aegis H45 Classic'):
  files={'Грех X ISTERIKA':'greh-isterika.webp','Rick and Morty Bad Acid':'rick-morty-line.webp','Xros 5 mini':'xros-5-mini.webp','AEGIS BOOST 3 KIT':'aegis-boost-3.webp','Aegis H45 Classic':'aegis-h45-classic.webp'}
  item['image_url']='data:image/webp;base64,'+base64.b64encode((ROOT/'public/media'/files[item['name']]).read_bytes()).decode('ascii')
  item['photo_note']='Фото оригинальной линейки / модели'
css=(ROOT/'public/style.css').read_text(encoding='utf-8')
icons=(ROOT/'public/icons.svg').read_text(encoding='utf-8')
def markup(which):
 html=(ROOT/'public'/which).read_text(encoding='utf-8')
 html=re.sub(r'<link rel="stylesheet"[^>]*>',f'<style>{css}</style>',html)
 html=re.sub(r'<script src="https://telegram.org/js/telegram-web-app.js" defer></script>','',html)
 script='app.js' if which=='index.html' else 'admin.js'
 js=(ROOT/'public'/script).read_text(encoding='utf-8')
 stub="""<script>
 window.Telegram={WebApp:{initData:'mock',initDataUnsafe:{user:{id:8204734421,first_name:'Кирилл',username:'kirill'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{selectionChanged(){},impactOccurred(){}}}};
 window.__calls=[];window.fetch=async function(url,opts={}){window.__calls.push([url,opts.method||'GET']);let data=url==='/api/me'?{admin:true,name:'Кирилл'}:url==='/api/admin/stats'?{visitors:12,new7:3,active30:7,inquiries:1}:url==='/api/products'||url==='/api/admin/products'?window.__products:{id:22,ok:true,changed:0,skipped:0,delivered:2};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})};
 </script>"""
 stub=stub.replace('window.__calls=[];',f'window.__products={json.dumps(products,ensure_ascii=False)};window.__calls=[];')
 
 html=re.sub(r'<script src="/'+script.replace('.','\\.')+r'\?v=[^"]+" defer></script>','',html)
 html=html.replace('</body>',stub+'<script>'+js+'</script></body>')
 
 return html
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(320,568),(375,812),(390,844),(768,900)]:
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<500,has_touch=w<500)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(markup('index.html'));page.wait_for_selector('.product-card')
  assert page.locator('#featured .product-card').count()==4
  assert page.locator('#homeCount').inner_text()=='21'
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),f'Home overflow {w}'
  if w==375:page.screenshot(path='/mnt/data/parohod25-work/home375.png',full_page=True)
  page.locator('.bottom-nav button[data-page="catalog"]').click();assert page.locator('#products .product-card').count()==21
  assert page.locator('#products .image-fallback:not([hidden])').count()>=1
  page.wait_for_function("document.querySelectorAll('#products .product-img').length >= 5 && Array.from(document.querySelectorAll('#products .product-img')).some(x=>x.complete && x.naturalWidth > 0)")
  assert page.locator('#products .photo-series-note').count() >= 5
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),f'Catalog overflow {w}'
  if w==375:page.screenshot(path='/mnt/data/parohod25-work/catalog375.png',full_page=True)
  page.locator('#search').fill('xros 6');assert page.locator('#products .product-card').count()==2
  page.locator('#clearSearch').click();assert page.locator('#products .product-card').count()==21
  page.locator('#chips button[data-cat="Расходники"]').click();assert page.locator('#products .product-card').count()==4
  page.locator('#chips button[data-cat="Все"]').click()
  page.locator('#products [data-fav]').first.click();page.locator('.bottom-nav button[data-page="favorites"]').click();assert page.locator('#favoriteProducts .product-card').count()==1;assert page.locator('#sendInquiry').is_enabled();page.once('dialog',lambda d:d.accept());page.locator('#sendInquiry').click();page.wait_for_function("window.__calls.some(([url,method])=>url==='/api/inquiries'&&method==='POST')")
  page.locator('#favoriteProducts [data-view]').first.click();assert page.locator('#productDialog').evaluate('(x)=>x.open')
  page.locator('[data-close-dialog]').first.click();assert not page.locator('#productDialog').evaluate('(x)=>x.open')
  page.locator('.bottom-nav button[data-page="profile"]').click();assert 'Кирилл' in page.locator('#userName').inner_text()
  assert not page.locator('#profileAdmin').is_hidden()
  assert not errors,('Client',w,errors)
  page.goto('about:blank');page.set_content(markup('admin.html'));page.wait_for_selector('#panel:not([hidden])')
  assert page.locator('.admin-item').count()==21;assert page.locator('#statVisitors').inner_text()=='12';page.once('dialog',lambda d:d.accept());page.locator('#allAvailable').click();page.wait_for_function("window.__calls.some(([url,method])=>url==='/api/admin/availability'&&method==='PUT')")
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),f'Admin overflow {w}'
  page.locator('#adminSearch').fill('pasito');assert page.locator('.admin-item').count()==2
  page.locator('#adminSearch').fill('');page.locator('[data-edit="1"]').click();assert page.locator('#editorDialog').evaluate('(x)=>x.open')
  page.locator('#editor input[name="price"]').fill('451');page.locator('#saveButton').click();page.wait_for_timeout(70)
  assert page.evaluate("window.__calls.some(([url,method])=>url==='/api/admin/products/1' && method==='PUT')")
  if w==375:page.screenshot(path='/mnt/data/parohod25-work/admin375.png',full_page=True)
  assert not errors,('Admin',w,errors)
  print(f'PASS {w}x{h}: catalog 21, search, filters, favorites, detail, profile, admin edit, no overflow / exceptions')
  ctx.close()
 browser.close()
