// 빌드한 서가를 실제 브라우저로 열어 캡처한다. 작업 후 화면 확인용.
// 처음 한 번: npx playwright install chromium
// 사용법: node scripts/shot.js [slug]   → shots/<slug>-*.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2] || 'limjihyung';
const page = path.join(root, 'dist', slug, 'index.html');
if (!fs.existsSync(page)) { console.error(`dist/${slug}/index.html이 없습니다. 먼저 npm run build`); process.exit(1); }
// 책 주소(…/<ISBN>/)가 동작하도록 파일이 아니라 GitHub Pages처럼 동작하는 작은 서버로 연다 (2026-11-08)
const srv = await serve(path.join(root, 'dist'));
const url = `http://127.0.0.1:${srv.address().port}/${slug}/`;
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const out = name => path.join(root, 'shots', `${slug}-${name}.png`);

const browser = await chromium.launch();
const errors = [];
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
desk.on('pageerror', e => errors.push('desktop: ' + e.message));
await desk.goto(url); await desk.waitForTimeout(2500);
await desk.screenshot({ path: out('1-shelf') });
await desk.mouse.click(720, 330); await desk.waitForTimeout(3200);
await desk.screenshot({ path: out('2-detail') });
await desk.keyboard.press('Escape'); await desk.waitForTimeout(1200);
await desk.click('#navLib'); await desk.waitForTimeout(1500);
await desk.screenshot({ path: out('3-library') });
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mob.on('pageerror', e => errors.push('mobile: ' + e.message));
await mob.goto(url); await mob.waitForTimeout(2200);
await mob.screenshot({ path: out('4-mobile-shelf') });
await mob.goto(url + '#books'); await mob.waitForTimeout(1800);
await mob.screenshot({ path: out('5-mobile-library') });
let n = 5;
if (await desk.$('#navAbout')) {
  await desk.goto(url + '#about'); await desk.waitForTimeout(1500);
  await desk.screenshot({ path: out('6-about') });
  await desk.evaluate(() => document.getElementById('about').scrollTo(0, document.getElementById('about').scrollHeight));
  await desk.waitForTimeout(400); await desk.screenshot({ path: out('7-about-end') });
  await mob.goto(url + '#about'); await mob.waitForTimeout(1500);
  await mob.screenshot({ path: out('8-mobile-about') });
  await mob.evaluate(() => document.getElementById('about').scrollTo(0, 900)); await mob.waitForTimeout(300);
  await mob.screenshot({ path: out('9-mobile-about-2') });
  n += 4;
}
const dark = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
dark.on('pageerror', e => errors.push('dark: ' + e.message));
await dark.goto(url); await dark.waitForTimeout(2500);
await dark.screenshot({ path: out('10-dark-shelf') });
await dark.goto(url + '#b-' + await dark.evaluate(() => JSON.parse(document.getElementById('books-data').textContent)[0].id)); await dark.waitForTimeout(3200);
await dark.screenshot({ path: out('11-dark-detail') });
n += 2;
// 책 주소: 주소로 바로 열기, 닫기, 뒤로 가기, 서고에서 열기, 주소 복사 (2026-11-08)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/[^/]*\/$/, '') });
  const p = await ctx.newPage(), bad = [];
  p.on('pageerror', e => errors.push('book: ' + e.message));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  const data = await (await fetch(url)).text();
  const all = JSON.parse(data.match(/id="books-data">([\s\S]*?)<\/script>/)[1]);
  const b = all.find(x => x.isbn) || all[0], key = b.isbn || b.id;
  const fail = m => errors.push('book: ' + m);
  const st = () => p.evaluate(() => ({ at: location.pathname + location.hash, open: !document.getElementById('detail').hidden, t: document.getElementById('dTitle').textContent, lib: !document.getElementById('lib').hidden }));
  await p.goto(url + key); await p.waitForTimeout(2600);
  let s = await st();
  if (!s.open || s.t !== b.title || !s.at.endsWith(`/${key}/`)) fail(`책 주소로 바로 열기 실패 (${s.at}, ${s.t})`);
  await p.screenshot({ path: out('12-mobile-book') }); n++;
  await p.click('#share'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  if (!clip.endsWith(`/${slug}/${key}/`)) fail('주소 복사 내용이 다름: ' + clip);
  if (b.isbn) { // 도서 정보 칸의 ISBN 복사
    await p.locator('#dBib .icopy').click(); await p.waitForTimeout(150);
    const c2 = await p.evaluate(() => navigator.clipboard.readText());
    if (c2 !== b.isbn) fail('ISBN 복사 내용이 다름: ' + c2);
    if (await p.locator('#dBib .icopy').textContent() !== '복사했어요') fail("ISBN 복사 뒤 '복사했어요'가 안 나옴");
  }
  await p.click('#close'); await p.waitForTimeout(900); s = await st();
  if (s.open || !s.at.endsWith(`/${slug}/`)) fail(`닫기 뒤 주소 ${s.at}`);
  await p.goBack(); await p.waitForTimeout(1300); s = await st();
  if (!s.open || s.t !== b.title) fail('뒤로 가기로 책이 다시 열리지 않음');
  await p.goto(url + '#books'); await p.waitForTimeout(1500);
  await p.locator('#grid .card').first().click(); await p.waitForTimeout(1400); s = await st();
  if (!s.open || !/\/\d{13}\/$|\/[a-z0-9-]+\/$/i.test(s.at) || s.at.endsWith(`/${slug}/`)) fail(`서고에서 연 책 주소 ${s.at}`);
  await p.goBack(); await p.waitForTimeout(1100); s = await st();
  if (s.open || !s.lib) fail(`뒤로 가기 뒤 서고가 아님 (${s.at})`);
  const page1 = await (await fetch(url + key + '/')).text();
  if (!page1.includes(`og:title" content="${b.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}`)) fail('책 주소 페이지에 미리보기 제목 태그가 없음');
  if (bad.length) fail('못 찾은 파일: ' + [...new Set(bad)].slice(0, 5).join(', '));
  console.log(`책 주소 확인: ${url}${key}/ (${b.title})`);
  await ctx.close();
}
await browser.close();
srv.close();
console.log(`캡처 ${n}장 → shots/${slug}-*.png`);
if (errors.length) { console.error('페이지 오류:\n' + errors.join('\n')); process.exit(1); }
