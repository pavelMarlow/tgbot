import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__test} from '../worker/index.js';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('public/catalog-preview.json',root),'utf8'));
const expected=new Map([
['Солевая монашка',450],['Злая монашка',500],['DUALL X Злая монашка',500],['ISTERIKA X Самоубийца',500],['ISTERIKA CLASSIC',450],['Грех X ISTERIKA',450],['Rick and Morty Bad Acid',500],['ICE FOX extra hard',550],
['Картридж Xros 0.6',250],['Картридж Xros 0.8',250],['Картридж Xros 0.4',250],['Картридж Pasito K-5',250],
['Xros 6',2300],['Xros 6 mini',1600],['Xros 5 mini',1500],['Xros mini',1100],['AEGIS BOOST 3 KIT',2600],['Aegis Nano 3',2200],['Aegis Hero 5 Racing',2500],['Aegis H45 Classic',2300],['Pasito 3',3000]
]);
test('21 names, prices, category count and no invented availability',()=>{
 assert.equal(catalog.length,21);assert.equal(new Set(catalog.map(x=>x.name)).size,21);
 for(const p of catalog)assert.equal(p.price,expected.get(p.name),p.name);
 const sums=Object.fromEntries(['Жидкости','Расходники','Устройства'].map(c=>[c,catalog.filter(p=>p.category===c).length]));assert.deepEqual(sums,{'Жидкости':8,'Расходники':4,'Устройства':9});
 assert.ok(catalog.every(p=>!p.image_url&&!p.available));
});
test('no explicit SQL transaction in D1 import',()=>{
 const sql=readFileSync(new URL('catalog_21.sql',root),'utf8');assert.doesNotMatch(sql,/^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT)\s*;/mi);
});
test('Windows PowerShell UTF-8 mojibake normalized without touching valid names',()=>{
 for(const name of [...expected.keys(),'Жидкости','Картриджи','На складе']){
  const corrupted=new TextDecoder('windows-1251').decode(new TextEncoder().encode(name));
  assert.equal(__test.repairText(corrupted),name,corrupted);
  assert.equal(__test.repairText(name),name);
 }
 assert.equal(__test.repairText('РОСА'),'РОСА');
});
test('server requires HTTPS image links, keeps SKU and text limits',()=>{
 assert.throws(()=>__test.sanitize({name:'p',category:'Жидкости',image_url:'javascript:alert(1)'}));
 assert.equal(__test.sanitize({name:'Xros 6',category:'Устройства',price:2300,available:false}).available,0);
 assert.throws(()=>__test.sanitize({name:'',category:'Устройства'}));
});
