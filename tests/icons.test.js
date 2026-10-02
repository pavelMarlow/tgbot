import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const read=p=>readFileSync(resolve('public',p),'utf8');
const html=read('index.html'),admin=read('admin.html'),sheet=read('icons.svg'),css=read('style.css'),js=read('app.js');
const ids=text=>new Set([...text.matchAll(/<symbol id="([^"]+)"/g)].map(x=>x[1]));
test('matching fully inline icon assets for iPhone Telegram WebView',()=>{
  const mainIds=ids(html),adminIds=ids(admin),sheetIds=ids(sheet);
  assert.ok(mainIds.size>=24);
  assert.deepEqual(mainIds,sheetIds);
  assert.deepEqual(adminIds,sheetIds);
  for(const [name,text] of [['client',html],['admin',admin]]) {
    for(const m of text.matchAll(/<use href="#([^"]+)"/g))assert.ok(ids(text).has(m[1]),`${name}: missing ${m[1]}`);
    assert.ok(!text.includes('href="/icons.svg#'),`${name}: external sprite dependency`);
  }
});
test('four navigation entries with professional unified SVG icons and names',()=>{
  const nav=html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  for(const [page,icon] of [['home','i-home'],['catalog','i-grid'],['favorites','i-heart'],['profile','i-user']]) {
    assert.ok(nav.includes(`data-page="${page}"`));
    assert.ok(nav.includes(`href="#${icon}"`));
  }
  assert.equal((nav.match(/<button /g)||[]).length,4);
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
  assert.ok(css.includes('focus-visible'));
});
test('administrator gear defaults hidden, server verification is required',()=>{
  for(const id of ['adminLink','drawerAdmin','profileAdmin']) {
    assert.match(html,new RegExp(`<[^>]*id="${id}"[^>]*hidden`));
    assert.ok(js.includes(`'${id}'`));
  }
  assert.ok(js.includes("fetch('/api/me'"));
  assert.ok(js.includes('if(me?.admin)'));
  assert.ok(!js.includes('initDataUnsafe?.user?.id===8204734421'));
});
