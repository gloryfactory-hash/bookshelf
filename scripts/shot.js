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
  await ctx.addInitScript(() => { navigator.share = async d => { window.__shared = d; }; }); // 휴대폰 공유 창 흉내
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
  // 휴대폰 상세 (2026-11-08): 위 머리줄은 작가 이름만, 아래 고정 줄 [닫기][공유], 바로 들어오면 '전체 작품 보기'
  const ui = await p.evaluate(() => {
    const vis = id => !!document.getElementById(id).offsetParent, bar = document.querySelector('.dbar').getBoundingClientRect();
    const shops = [...document.querySelectorAll('#dBuy .shops a')].map(a => ({ t: a.textContent, top: Math.round(a.getBoundingClientRect().top), w: Math.round(a.getBoundingClientRect().width) }));
    return { topBtns: vis('close') || vis('share'), barBtns: vis('closeB') && vis('shareB'), barBottom: Math.round(bar.bottom), barH: Math.round(document.getElementById('closeB').getBoundingClientRect().height), vh: innerHeight,
      label: document.getElementById('closeB').textContent, headBg: getComputedStyle(document.querySelector('.dhead')).backgroundImage, shops };
  });
  if (ui.topBtns || !ui.barBtns) fail('휴대폰 상세: 위 단추가 보이거나 아래 줄 단추가 안 보임');
  if (Math.abs(ui.barBottom - ui.vh) > 1 || ui.barH !== 48) fail(`휴대폰 아래 줄 위치·높이 (${ui.barBottom}/${ui.vh}, ${ui.barH}px)`);
  if (ui.label !== '전체 작품 보기') fail("바로 들어왔는데 닫기 이름이 '전체 작품 보기'가 아님: " + ui.label);
  if (ui.headBg !== 'none') fail('상세 머리줄 바탕이 꽉 차 있지 않음');
  if (!ui.shops.length || new Set(ui.shops.map(x => x.top)).size !== 1 || new Set(ui.shops.map(x => x.w)).size !== 1) fail('서점 단추가 한 줄 같은 너비가 아님: ' + JSON.stringify(ui.shops));
  if (ui.shops[0] && b.links.yes24 && ui.shops[0].t !== 'YES24') fail('서점 첫째가 YES24가 아님');
  await p.click('#shareB'); await p.waitForTimeout(150);
  const shared = await p.evaluate(() => window.__shared);
  if (!shared || !shared.url.endsWith(`/${slug}/${key}/`) || !shared.title.startsWith(b.title)) fail('공유 창에 넘긴 내용이 다름: ' + JSON.stringify(shared));
  // 비슷한 책: 옆으로 넘기는 한 줄, 카드는 화면의 40%
  const rel = await p.evaluate(() => { const r = [...document.querySelectorAll('.drel:not([hidden]) .row')].pop(); if (!r) return null; r.scrollIntoView(); const c = r.querySelector('.card'); return { n: r.children.length, sw: r.scrollWidth, cw: r.clientWidth, w: c.getBoundingClientRect().width, t: parseFloat(getComputedStyle(c.querySelector('.t')).fontSize) }; });
  if (rel) {
    if (rel.n > 2 && rel.sw <= rel.cw) fail('비슷한 책 줄이 옆으로 넘어가지 않음');
    if (Math.abs(rel.w - 390 * .4) > 2 || rel.t !== 16.5) fail(`비슷한 책 카드 너비·제목 크기 (${rel.w}px, ${rel.t}px)`);
    await p.waitForTimeout(300); await p.screenshot({ path: out('13-mobile-related') }); n++;
  }
  if (b.isbn) { // 도서 정보 칸의 ISBN 복사
    await p.locator('#dBib .icopy').click(); await p.waitForTimeout(150);
    const c2 = await p.evaluate(() => navigator.clipboard.readText());
    if (c2 !== b.isbn) fail('ISBN 복사 내용이 다름: ' + c2);
    if (await p.locator('#dBib .icopy').textContent() !== '복사했어요') fail("ISBN 복사 뒤 '복사했어요'가 안 나옴");
  }
  await p.click('#closeB'); await p.waitForTimeout(900); s = await st();
  if (s.open || !s.lib || !s.at.endsWith(`/${slug}/#books`)) fail(`바로 들어와 '전체 작품 보기'를 누른 뒤 주소 ${s.at}`);
  await p.goBack(); await p.waitForTimeout(1300); s = await st();
  if (!s.open || s.t !== b.title) fail('뒤로 가기로 책이 다시 열리지 않음');
  if (await p.textContent('#closeB') !== '닫기') fail("서고를 본 뒤에도 닫기 이름이 '닫기'가 아님");
  await p.click('#closeB'); await p.waitForTimeout(900); s = await st();
  if (s.open) fail('닫기로 상세가 닫히지 않음');
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
  // 컴퓨터: 위 단추(닫기 이름 규칙, 주소 복사), 아래 줄은 숨김
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/[^/]*\/$/, '') });
  const q = await dctx.newPage(); q.on('pageerror', e => errors.push('desktop book: ' + e.message));
  await q.goto(url + key + '/'); await q.waitForTimeout(2600);
  if (await q.textContent('#close') !== '전체 작품 보기') fail("컴퓨터에서 바로 들어왔는데 닫기 이름이 '전체 작품 보기'가 아님");
  if (await q.isVisible('.dbar')) fail('컴퓨터에서 아래 고정 줄이 보임');
  await q.click('#share'); await q.waitForTimeout(150);
  const clip = await q.evaluate(() => navigator.clipboard.readText());
  if (!clip.endsWith(`/${slug}/${key}/`)) fail('주소 복사 내용이 다름: ' + clip);
  // 마우스 올림: 테두리 서점 단추는 옅은 주황 바탕, 채운 단추는 색이 바뀜
  const shop = q.locator('#dBuy .shops a');
  if (await shop.count() > 1) {
    const bg = async i => shop.nth(i).evaluate(a => getComputedStyle(a).backgroundColor);
    const b0 = await bg(0), b1 = await bg(1);
    await shop.nth(0).hover(); await q.waitForTimeout(300); const h0 = await bg(0);
    await shop.nth(1).hover(); await q.waitForTimeout(300); const h1 = await bg(1);
    if (b0 === h0 || b1 === h1) fail(`서점 단추에 마우스를 올려도 바탕이 그대로 (${b0}→${h0}, ${b1}→${h1})`);
    await q.screenshot({ path: out('14-desktop-book-hover'), clip: { x: 0, y: 0, width: 1440, height: 900 } }); n++;
  }
  await dctx.close();
}
// 첫 화면 (2026-11-08, 시안 track_v1 나): '+' 동그라미·'전체 작품 보기' 없음, 부부작당은 글씨만, 제목 누르면 책 소개, 출발 구역, 트랙 위 캐릭터
{
  const fail = m => errors.push('first: ' + m);
  const runner = JSON.parse((await (await fetch(url)).text()).match(/id="site-data">([\s\S]*?)<\/script>/)[1]).runner;
  for (const [vw, vh, mobile] of [[1440, 900, false], [390, 844, true], [360, 640, true]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`first ${vw}: ` + e.message));
    await p.goto(url); await p.waitForTimeout(2400);
    const r = await p.evaluate(() => {
      const R = e => e && e.getBoundingClientRect(), q = s => document.querySelector(s);
      const yr = [...document.querySelectorAll('.tl .yr')].filter(e => e.offsetParent).map(R), fb = [...document.querySelectorAll('.foot .fr>a')].map(R);
      return { ring: !!q('#ring'), footLib: !!q('#footLib'), bbLink: q('.brand .bb').tagName, start: !!q('.tl .start'), rn: !!q('.tl .dot .rn'), cls: q('#dot').className,
        footTop: Math.min(...fb.map(x => x.top)), yrBottom: Math.max(...yr.map(x => x.bottom)), capBottom: R(q('#cap')).bottom, grTop: R(q('#gr')).top, fbH: fb.map(x => Math.round(x.height)) };
    });
    if (r.ring || r.footLib) fail(`${vw}: '+' 동그라미나 '전체 작품 보기'가 남아 있음`);
    if (r.bbLink === 'A') fail('부부작당이 아직 링크');
    if (!r.start) fail('출발 구역이 없음');
    if (runner && !r.rn) fail('캐릭터가 없음');
    if (!runner && r.rn) fail('캐릭터를 켜지 않은 서가에 캐릭터가 있음');
    if (r.footTop < r.yrBottom) fail(`${vw}: 아래 단추가 연도 글자와 겹침 (${r.footTop} < ${r.yrBottom})`);
    if (r.grTop - r.capBottom < 4) fail(`${vw}: 학년 줄이 책 정보와 붙음 (${Math.round(r.grTop - r.capBottom)}px)`);
    if (runner) {
      await p.waitForTimeout(1200);
      if (!/\b(stand|strA|strB|heart)\b/.test(await p.getAttribute('#dot', 'class'))) fail(`${vw}: 멈춘 뒤 서 있지 않음 (${await p.getAttribute('#dot', 'class')})`);
      const tb = await p.locator('#tl').boundingBox();
      await p.mouse.click(tb.x + tb.width * .2, tb.y + 14);
      // 가운데 책과 같은 해 책을 먼저 지나가면 캐릭터가 조금 늦게 출발한다 (leadBook, 2026-11-08). 1초까지 기다린다
      await p.waitForFunction(() => /\brun\b/.test(document.querySelector('#dot').className), null, { timeout: 1000 }).catch(() => {});
      const c1 = await p.getAttribute('#dot', 'class');
      if (!/\brun\b/.test(c1) || !/\bl\b/.test(c1)) fail(`${vw}: 옛날 책 쪽으로 달리지 않음 (${c1})`);
      if (!mobile) await p.screenshot({ path: out('15-desktop-run') });
    }
    if (!mobile) {
      await p.waitForTimeout(1600);
      await p.hover('#mTitle'); await p.waitForTimeout(350);
      const dec = await p.evaluate(() => getComputedStyle(document.querySelector('#mTitle .ctitle:last-child')).textDecorationColor);
      if (/rgba\(0, 0, 0, 0\)/.test(dec)) fail('제목에 마우스를 올려도 밑줄이 안 생김');
      await p.screenshot({ path: out('16-desktop-title-hover') });
      await p.click('#mTitle'); await p.waitForTimeout(1500);
      if (await p.evaluate(() => document.getElementById('detail').hidden)) fail('제목을 눌러도 책 소개가 안 열림');
    } else if (vw === 360) await p.screenshot({ path: out('17-small-shelf') });
    n += mobile && vw === 390 ? 0 : 1;
    await ctx.close();
  }
}
await browser.close();
srv.close();
console.log(`캡처 ${n}장 → shots/${slug}-*.png`);
if (errors.length) { console.error('페이지 오류:\n' + errors.join('\n')); process.exit(1); }
