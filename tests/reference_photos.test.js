import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {__test} from '../worker/index.js';
const {KNOWN_MEDIA,REFERENCE_PAGES,referencePhoto}=__test;
const preview=JSON.parse(readFileSync(new URL('../public/catalog-preview.json',import.meta.url),'utf8'));
test('every reference has an exact named product, local media exists, and unverified entries are excluded',()=>{
 const names=new Set(preview.map(p=>p.name));assert.equal(names.size,21);
 for(const [name,photo] of Object.entries(KNOWN_MEDIA)){
  assert.ok(names.has(name),name);assert.ok(photo.note?.startsWith('Фото'),name);
  if(photo.url.startsWith('/media/'))assert.ok(existsSync(new URL('../public'+photo.url,import.meta.url)),name);
  if(photo.url.startsWith('/api/reference-photo/'))assert.ok(REFERENCE_PAGES[photo.url.split('/').pop()],name);
 }
 assert.equal(KNOWN_MEDIA['Солевая монашка'],undefined);
 assert.equal(KNOWN_MEDIA['ICE FOX extra hard'],undefined);
 assert.equal(KNOWN_MEDIA['Картридж Pasito K-5'],undefined);
});
test('manufacturer image resolved from a valid exact-model Shopify source',async()=>{
 const realFetch=globalThis.fetch;
 try{
  globalThis.fetch=async url=>{
   assert.equal(url,'https://store.vaporesso.com/products/xros-6.js');
   return new Response(JSON.stringify({title:'XROS 6',featured_image:'https://cdn.shopify.com/xros6.jpg'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const r=await referencePhoto('xros6');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://cdn.shopify.com/xros6.jpg');
 }finally{globalThis.fetch=realFetch}
});
test('replaces normal cartridge picture with requested resistance when manufacturer variant exists',async()=>{
 const realFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({title:'XROS Series Pods',featured_image:'https://cdn.shopify.com/pods.jpg',variants:[{title:'0.6Ω / 2ml',featured_image:{src:'https://cdn.shopify.com/06.jpg'}},{title:'0.8Ω / 2ml',featured_image:{src:'https://cdn.shopify.com/08.jpg'}}]}));
  const r=await referencePhoto('xrospod06');assert.equal(r.headers.get('location'),'https://cdn.shopify.com/06.jpg');
 }finally{globalThis.fetch=realFetch}
});
test('rejects unrelated or insecure vendor image source',async()=>{
 const realFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({title:'Wrong product',featured_image:'http://bad.example/photo.jpg'}));
  assert.equal((await referencePhoto('xros6')).status,502);
  assert.equal((await referencePhoto('random')).status,404);
 }finally{globalThis.fetch=realFetch}
});
