// ParoHod 2.5 — Cloudflare Worker, D1 and Telegram Mini App authentication.
const CATS=new Set(['Жидкости','Устройства','Одноразовые','Расходники','Аксессуары','Другое']);
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>json({error:message},status);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
function equalHex(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,new TextEncoder().encode(data))}
async function identify(request,env){
  const token=env.BOT_TOKEN,raw=request.headers.get('authorization')||'';
  if(!token||!raw.startsWith('tma '))return null;
  const s=new URLSearchParams(raw.slice(4)),hash=s.get('hash');
  if(!hash||!/^[a-f0-9]{64}$/.test(hash)||s.getAll('hash').length!==1)return null;
  const ts=Number(s.get('auth_date')),now=Date.now()/1000;
  if(!Number.isSafeInteger(ts)||ts>now+60||now-ts>86400)return null;
  const check=[...s].filter(([k])=>k!=='hash').map(([k,v])=>`${k}=${v}`).sort().join('\n');
  const secret=await hmac(new TextEncoder().encode('WebAppData'),token),actual=hex(await hmac(secret,check));
  if(!equalHex(actual,hash))return null;
  try{const u=JSON.parse(s.get('user'));return Number.isSafeInteger(u.id)?u:null}catch{return null}
}
function isAdmin(u,env){return !!u&&String(env.ADMIN_IDS||'').split(',').map(x=>x.trim()).includes(String(u.id))}
// Reverse the Windows PowerShell 5.1 UTF-8 -> Windows-1251 misdecode without guessing product IDs.
const cp1251=new Map();
for(let n=0;n<256;n++){const c=new TextDecoder('windows-1251').decode(Uint8Array.of(n));if(c!=='\ufffd')cp1251.set(c,n)}
const utf8=new TextDecoder('utf-8',{fatal:true});
function repairText(value){
  if(typeof value!=='string'||!/Р.|С./u.test(value))return value;
  let result=value;
  for(let attempt=0;attempt<2;attempt++){
    if(!/(?:Р.|С.){2}/u.test(result))break;
    const bytes=[];let ok=true;
    for(const ch of result){if(!cp1251.has(ch)){ok=false;break}bytes.push(cp1251.get(ch))}
    if(!ok)break;
    let next;try{next=utf8.decode(Uint8Array.from(bytes))}catch{break}
    if(next===result||!/[А-Яа-яЁё]/u.test(next))break;
    result=next;
  }
  return result;
}
function display(p){return {...p,name:repairText(p.name),category:repairText(p.category),description:repairText(p.description)}}
function sanitize(p){
  if(!p||typeof p!=='object')throw Error('Неверные данные');
  const name=String(p.name||'').trim(),category=String(p.category||'Другое'),desc=String(p.description||'').trim(),image=String(p.image_url||'').trim();
  if(!name||name.length>150)throw Error('Название: 1–150 символов');
  if(!CATS.has(category))throw Error('Неизвестная категория');
  if(desc.length>2000)throw Error('Описание слишком длинное');
  if(image&&(!/^https:\/\//i.test(image)||image.length>1000))throw Error('Для фото нужна HTTPS-ссылка до 1000 символов');
  const price=p.price===null||p.price===undefined||p.price===''?null:Number(p.price);
  if(price!==null&&(!Number.isSafeInteger(price)||price<0||price>10000000))throw Error('Некорректная цена');
  return {name,category,price,description:desc,image_url:image,available:p.available===false||p.available===0?0:1,published:p.published===false||p.published===0?0:1};
}
async function save(db,p,id){
  const d=sanitize(p);
  if(id){const r=await db.prepare('UPDATE products SET name=?,category=?,price=?,description=?,image_url=?,available=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.name,d.category,d.price,d.description,d.image_url,d.available,d.published,id).run();if(!r.meta.changes)throw Error('Товар не найден');return {id}}
  const r=await db.prepare('INSERT INTO products(name,category,price,description,image_url,available,published) VALUES(?,?,?,?,?,?,?)').bind(d.name,d.category,d.price,d.description,d.image_url,d.available,d.published).run();return {id:r.meta.last_row_id};
}
// Genuine reference photographs: local files have been visually checked against the product series.
// External image fallback is resolved only from a fixed manufacturer's exact-model product page;
// no arbitrary URLs or fuzzy top-result images are used. A customer's own uploaded photo wins.
const KNOWN_MEDIA = Object.freeze({
  'Грех X ISTERIKA': {url:'/media/greh-isterika.webp',note:'Фото линейки: конкретный вкус не указан'},
  'Rick and Morty Bad Acid': {url:'/media/rick-morty-line.webp',note:'Фото линейки: конкретный вкус не указан'},
  'Xros 5 mini': {url:'/media/xros-5-mini.webp',note:'Фото модели: цвет может отличаться'},
  'AEGIS BOOST 3 KIT': {url:'/media/aegis-boost-3.webp',note:'Фото модели: варианты цвета'},
  'Aegis H45 Classic': {url:'/media/aegis-h45-classic.webp',note:'Фото модели: варианты цвета'},
  'Злая монашка': {url:'/api/reference-photo/zlayamonashka',note:'Фото линейки: вкус и крепость могут отличаться'},
  'DUALL X Злая монашка': {url:'/api/reference-photo/duallmonashka',note:'Фото линейки: конкретный вкус не указан'},
  'ISTERIKA CLASSIC': {url:'/api/reference-photo/isterikaclassic',note:'Фото линейки: конкретный вкус не указан'},
  'Xros 6': {url:'/api/reference-photo/xros6',note:'Фото производителя: цвет может отличаться'},
  'Xros 6 mini': {url:'/api/reference-photo/xros6mini',note:'Фото производителя: цвет может отличаться'},
  'Xros mini': {url:'/api/reference-photo/xrosmini',note:'Фото производителя: цвет может отличаться'},
  'Aegis Nano 3': {url:'/api/reference-photo/aegisnano3',note:'Фото производителя: цвет может отличаться'},
  'Картридж Xros 0.6': {url:'/api/reference-photo/xrospod06',note:'Фото серии: сопротивление указано в названии'},
  'Картридж Xros 0.8': {url:'/api/reference-photo/xrospod08',note:'Фото серии: сопротивление указано в названии'},
  'Картридж Xros 0.4': {url:'/api/reference-photo/xrospod04',note:'Фото серии: сопротивление указано в названии'},
  'Aegis Hero 5 Racing': {url:'/api/reference-photo/hero5racing',note:'Фото модели Racing Edition: цвет может отличаться'},
  'Pasito 3': {url:'/api/reference-photo/pasito3',note:'Фото производителя: цвет может отличаться'}
});
const REFERENCE_PAGES = Object.freeze({
  xros6:['shopify','https://store.vaporesso.com/products/xros-6.js','xros 6'],
  xros6mini:['shopify','https://store.vaporesso.com/products/xros-6-mini.js','xros 6 mini'],
  xrosmini:['shopify','https://store.vaporesso.com/products/xros-mini.js','xros mini'],
  aegisnano3:['shopify','https://store.geekvape.com/products/geekvape-aegis-nano-3-kit-1600mah.js','aegis nano 3'],
  xrospod04:['shopify','https://store.vaporesso.com/products/xros-series-pods-4pcs.js','xros'],
  xrospod06:['shopify','https://store.vaporesso.com/products/xros-series-pods-4pcs.js','xros'],
  xrospod08:['shopify','https://store.vaporesso.com/products/xros-series-pods-4pcs.js','xros'],
  hero5racing:['shopify','https://www.huffandpuffers.com/products/geekvape-aegis-hero-5.js','aegis hero 5'],
  pasito3:['meta','https://smoant.com/pod-systems/s052-pasito-3/','pasito'],
  zlayamonashka:['meta','https://xn--80aaxitdbjk.xn--p1ai/product/zlaya-monashka-pina-kolada/','злая монашка'],
  duallmonashka:['meta','https://xn--1-8sbad5bxa5a6byb.online/catalog/zhidkosti/zlaya-monashka/duall-x-zlaya-monashka-hard/sour_4/duall-x-zlaya-monashka-sour-hard-kislaya-smorodina-vinograd-30-ml/','duall'],
  isterikaclassic:['meta','https://isterika-salt.ru/isterika_classic','isterika']
});
const cleanPhotoUrl=(raw,base)=>{try{const u=new URL(raw,base);return u.protocol==='https:'?u.toString():null}catch{return null}};
async function referencePhoto(key){
  const cfg=REFERENCE_PAGES[key];if(!cfg)return fail('Фото не найдено',404);
  const [kind,url,check]=cfg;
  const upstream=await fetch(url,{headers:{Accept:kind==='shopify'?'application/json':'text/html'},redirect:'follow'});
  if(!upstream.ok)return fail('Фото производителя временно недоступно',502);
  let selected=null;
  if(kind==='shopify'){
    const data=await upstream.json();
    if(!String(data.title||'').toLowerCase().includes(check))return fail('Источник не соответствует модели',502);
    selected=data.featured_image||data.images?.[0];
    if(typeof selected==='object')selected=selected?.src||selected?.url;
    if(key.startsWith('xrospod')){
      const omega=key.slice(-2);const resistance=omega==='04'?'0.4':omega==='06'?'0.6':'0.8';
      const variant=(data.variants||[]).find(v=>String(v.title||'').includes(resistance));
      selected=variant?.featured_image?.src||selected;
    }
    if(key==='hero5racing'){
      const variant=(data.variants||[]).find(v=>/racing/i.test(v.title||''));
      selected=variant?.featured_image?.src||selected;
      if(!variant)return fail('Нет подтверждённого фото Racing Edition',404);
    }
  }else{
    const html=(await upstream.text()).slice(0,1500000);
    const title=html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]||'';
    if(!title.toLowerCase().includes(check))return fail('Источник не соответствует модели',502);
    const tag=html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i)?.[0]||html.match(/<meta[^>]+content=["'][^"']+["'][^>]+(?:property|name)=["']og:image["'][^>]*>/i)?.[0]||'';
    selected=tag.match(/content=["']([^"']+)["']/i)?.[1];
  }
  const img=cleanPhotoUrl(selected,url);if(!img)return fail('Фото производителя не найдено',404);
  return new Response(null,{status:302,headers:{Location:img,'Cache-Control':'public, max-age=21600','Referrer-Policy':'no-referrer'}});
}
async function withPhotos(db,rows){
  let photos=[];try{photos=(await db.prepare('SELECT product_id,updated_at FROM product_photos').all()).results||[]}catch{};
  const photoMap=new Map(photos.map(p=>[p.product_id,p.updated_at]));
  return rows.map(p=>{const out=display(p);out.original_image_url=p.image_url;const m=KNOWN_MEDIA[out.name];out.photo_note=m?.note||"";out.photo_reference=Boolean(m);if(photoMap.has(p.id)){out.image_url=`/api/images/${p.id}?v=${encodeURIComponent(photoMap.get(p.id))}`;out.has_upload=true;out.photo_note="Загружено магазином"}else{out.has_upload=false;if(!out.image_url&&m)out.image_url=m.url}return out});
}
async function image(request,env,id){
  let r;try{r=await env.DB.prepare('SELECT data_url FROM product_photos WHERE product_id=?').bind(id).first()}catch{return fail('Изображение не найдено',404)}
  if(!r)return fail('Изображение не найдено',404);
  const m=/^data:image\/(webp|jpeg);base64,([a-z0-9+/=]+)$/i.exec(r.data_url||'');if(!m)return fail('Некорректное изображение',500);
  const raw=atob(m[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':`image/${m[1].toLowerCase()}`,'Content-Length':String(bytes.length),'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}})
}
const idFrom=path=>{const m=path.match(/\/(\d+)$/);if(!m)return null;const n=Number(m[1]);return Number.isSafeInteger(n)&&n>0?n:null};

// Minimal opt-in, signed-Telegram usage metrics. Only account ID and visit times; no IPs.
async function recordVisit(db,user){
  await db.prepare(`INSERT INTO app_visitors(telegram_id,visits) VALUES(?,1)
    ON CONFLICT(telegram_id) DO UPDATE SET visits=visits+CASE WHEN
      (julianday('now')-julianday(last_seen))*86400>=300 THEN 1 ELSE 0 END,
      last_seen=CURRENT_TIMESTAMP`).bind(String(user.id)).run();
}
async function stats(db){
  const r=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM app_visitors) visitors,
    (SELECT COUNT(*) FROM app_visitors WHERE first_seen>=datetime('now','-7 days')) new7,
    (SELECT COUNT(*) FROM app_visitors WHERE last_seen>=datetime('now','-30 days')) active30,
    (SELECT COUNT(*) FROM availability_inquiries) inquiries`).first();
  return r||{visitors:0,new7:0,active30:0,inquiries:0};
}
async function inquire(env,user,body){
  if(!body||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>15)return fail('Выберите от 1 до 15 позиций');
  const ids=body.ids;
  if(!ids.every(id=>Number.isSafeInteger(id)&&id>0)||new Set(ids).size!==ids.length)return fail('Некорректный список товаров');
  const db=env.DB,uid=String(user.id);
  const last=await db.prepare('SELECT created_at FROM availability_inquiries WHERE telegram_id=? ORDER BY id DESC LIMIT 1').bind(uid).first();
  if(last&&(Date.now()-Date.parse(last.created_at.replace(' ','T')+'Z'))<60000)return fail('Следующий запрос можно отправить через минуту',429);
  const today=await db.prepare("SELECT COUNT(*) n FROM availability_inquiries WHERE telegram_id=? AND created_at>=datetime('now','-1 day')").bind(uid).first();
  if((today?.n||0)>=5)return fail('Лимит запросов: 5 за 24 часа',429);
  const rows=(await db.prepare(`SELECT id,name FROM products WHERE published=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results||[];
  if(rows.length!==ids.length)return fail('Некоторые позиции больше не доступны в каталоге',409);
  const names=new Map(rows.map(p=>[p.id,repairText(p.name)]));
  const username=String(user.username||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);
  const name=String([user.first_name,user.last_name].filter(Boolean).join(' ')||'Пользователь').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,100);
  const message=['ParoHod · запрос наличия (не заказ)',`Пользователь: ${name}`,`Telegram ID: ${uid}`,username?`Username: @${username}`:'', 'Интересующие позиции:',...ids.map((id,i)=>`${i+1}. ${names.get(id)}`),'Покупка, оплата и доставка через приложение не оформляются.'].filter(Boolean).join('\n');
  const admins=String(env.ADMIN_IDS||'').split(',').map(s=>s.trim()).filter(s=>/^\d+$/.test(s));
  let delivered=0;
  for(const chat_id of new Set(admins)){
    let response;
    try{response=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id,text:message})})}catch{continue}
    if(response.ok){const result=await response.json().catch(()=>({}));if(result.ok)delivered++}
  }
  if(!delivered)return fail('Не удалось доставить сообщение администраторам. Каждый администратор должен сначала открыть чат с ботом.',502);
  await db.prepare('INSERT INTO availability_inquiries(telegram_id,item_count,delivered_count) VALUES(?,?,?)').bind(uid,ids.length,delivered).run();
  return json({ok:true,delivered});
}

export default {async fetch(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  try{
    if(path==='/api/products'&&method==='GET'){const r=await env.DB.prepare('SELECT id,name,category,price,description,image_url,available FROM products WHERE published=1 ORDER BY id DESC LIMIT 1000').all();return json(await withPhotos(env.DB,r.results||[]))}
    if(/^\/api\/images\/\d+$/.test(path)&&method==='GET')return image(request,env,idFrom(path));
    if(path.startsWith('/api/reference-photo/')&&method==='GET')return referencePhoto(path.split('/').pop());
    if(!path.startsWith('/api/')){
      const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');return new Response(r.body,{status:r.status,headers:h});
    }
    const user=await identify(request,env);
    if(path==='/api/me'&&method==='GET'){if(!user)return fail('Требуется вход через Telegram',401);await recordVisit(env.DB,user);return json({admin:isAdmin(user,env),name:user.first_name||''})}
    if(path==='/api/inquiries'&&method==='POST'){if(!user)return fail('Требуется вход через Telegram',401);return inquire(env,user,await request.json())}
    if(!isAdmin(user,env))return fail('Недостаточно прав',403);
    if(path==='/api/admin/stats'&&method==='GET')return json(await stats(env.DB));
    if(path==='/api/admin/availability'&&method==='PUT'){const body=await request.json();if(body.confirm!=='ALL_PRODUCTS'||typeof body.available!=='boolean')return fail('Требуется явное подтверждение',400);const result=await env.DB.prepare('UPDATE products SET available=?,updated_at=CURRENT_TIMESTAMP WHERE available<>?').bind(Number(body.available),Number(body.available)).run();return json({changed:result.meta.changes||0})}
    if(path==='/api/admin/products'&&method==='GET'){const r=await env.DB.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 3000').all();return json(await withPhotos(env.DB,r.results||[]))}
    if(path==='/api/admin/products'&&method==='POST')return json(await save(env.DB,await request.json()),201);
    const productPath=path.match(/^\/api\/admin\/products\/(\d+)$/);
    if(productPath){const id=idFrom(path);if(method==='PUT')return json(await save(env.DB,await request.json(),id));if(method==='DELETE'){const r=await env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run();if(!r.meta.changes)return fail('Товар не найден',404);try{await env.DB.prepare('DELETE FROM product_photos WHERE product_id=?').bind(id).run()}catch{}return new Response(null,{status:204})}}
    const photoPath=path.match(/^\/api\/admin\/images\/(\d+)$/);
    if(photoPath){
      const id=idFrom(path);
      if(method==='POST'){
        const body=await request.json();const data=String(body.data||'');
        if(data.length>320000||!/^data:image\/(webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data))return fail('Фото должно быть JPEG/WebP размером до 230 КБ');
        const exist=await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first();if(!exist)return fail('Товар не найден',404);
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS product_photos (product_id INTEGER PRIMARY KEY, data_url TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
        await env.DB.prepare('INSERT INTO product_photos(product_id,data_url,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(product_id) DO UPDATE SET data_url=excluded.data_url,updated_at=CURRENT_TIMESTAMP').bind(id,data).run();
        return json({ok:true});
      }
      if(method==='DELETE'){try{await env.DB.prepare('DELETE FROM product_photos WHERE product_id=?').bind(id).run()}catch{}return new Response(null,{status:204})}
    }
    if(path==='/api/admin/repair-encoding'&&method==='POST'){
      const rows=(await env.DB.prepare('SELECT id,name,category,description FROM products').all()).results||[];let changed=0,skipped=0;
      for(const p of rows){const d=display(p);if(d.name===p.name&&d.category===p.category&&d.description===p.description)continue;
        const duplicate=rows.some(other=>other.id!==p.id&&repairText(other.name).toLocaleLowerCase('ru')===d.name.toLocaleLowerCase('ru'));
        if(duplicate){skipped++;continue}
        await env.DB.prepare('UPDATE products SET name=?,category=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.name,CATS.has(d.category)?d.category:p.category,d.description,p.id).run();changed++;
      }
      return json({changed,skipped});
    }
    if(path==='/api/admin/import'&&method==='POST'){
      const body=await request.json();if(!Array.isArray(body.products)||body.products.length>500)throw Error('Максимум 500 позиций');
      const checked=body.products.map(p=>({...sanitize(p),id:p.id}));let count=0;
      for(const p of checked){let id=Number(p.id);if(!Number.isSafeInteger(id)||id<=0)id=null;if(id){const existing=await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first();if(!existing)id=null}await save(env.DB,p,id);count++}
      return json({count});
    }
    return fail('Не найдено',404);
  }catch(e){return fail(e?.message||'Ошибка сервера',400)}
}};
export const __test={repairText,sanitize,isAdmin,identify,KNOWN_MEDIA,REFERENCE_PAGES,referencePhoto,recordVisit,stats,inquire};
