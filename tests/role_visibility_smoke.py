"""UI role-gating smoke: decorative admin entry is never granted by initDataUnsafe alone."""
import pathlib,re,json
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
html=(ROOT/'public/index.html').read_text(encoding='utf-8')
css=(ROOT/'public/style.css').read_text(encoding='utf-8')
js=(ROOT/'public/app.js').read_text(encoding='utf-8')
html=re.sub(r'<link rel="stylesheet"[^>]*>',f'<style>{css}</style>',html)
html=html.replace('<script src="https://telegram.org/js/telegram-web-app.js" defer></script>','')
html=re.sub(r'<script src="/app\.js\?v=[^"]+" defer></script>','',html)
products=json.loads((ROOT/'public/catalog-preview.json').read_text(encoding='utf-8'))
for i,product in enumerate(products,1): product['id']=i
for role in ['guest','ordinary','admin']:
    uid='5094075415' if role=='admin' else '999999' if role=='ordinary' else None
    stub='''<script>
const __uid=UID;
if(__uid){window.Telegram={WebApp:{initData:'signed-payload',initDataUnsafe:{user:{id:__uid,first_name:'Test'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{selectionChanged(){}}}}}
window.fetch=async url =>new Response(JSON.stringify(url==='/api/me'?{admin:ROLE}:PRODUCTS),{status:200,headers:{'Content-Type':'application/json'}});
</script>'''.replace('UID',str(uid) if uid else 'null').replace('ROLE','true' if role=='admin' else 'false').replace('PRODUCTS',json.dumps(products,ensure_ascii=False))
    page_content=html.replace('</body>',stub+'<script>'+js+'</script></body>')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':375,'height':812});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(page_content);page.wait_for_selector('.product-card')
        if uid: page.wait_for_timeout(50)
        for ident in ['adminLink','drawerAdmin','profileAdmin']:
            assert page.locator('#'+ident).evaluate('(e)=>e.hidden') == (role!='admin'),(role,ident)
        assert not errors,(role,errors)
        print('PASS role',role,': admin entries',('visible' if role=='admin' else 'hidden'))
        browser.close()
