// 카카오톡 등에 링크를 붙였을 때 뜨는 미리보기 그림(1200×630)을 만든다. 2026-11-08 (시안 시안/address_v1 가안)
//   data/og/<slug>/<ISBN>.jpg  책마다 하나 (ISBN이 없으면 <ID>.jpg)
//   data/og/<slug>/site.jpg    서가 첫 화면용. 신간 표지를 쓴다(진열대 가운데 책과 같은 규칙)
// 배포(GitHub Actions)에는 브라우저가 없어서, 표지처럼 여기서 만들어 data/og에 넣어 두고 build는 복사만 한다.
// 바뀐 책만 다시 찍는다(그림에 들어가는 글·표지·디자인이 같으면 건너뜀).
//
// 사용법 (처음 한 번 npx playwright install chromium):
//   node scripts/og.js              draft가 아닌 모든 서가
//   node scripts/og.js kimminsung   한 서가만 (draft여도)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(root, ...p);
const only = process.argv[2] || null;
const books = JSON.parse(fs.readFileSync(P('data', 'books.json'), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(P('data', 'vocab.json'), 'utf8'));
const CH = JSON.parse(fs.readFileSync(P('data', 'channel.json'), 'utf8'));
const LABEL = Object.fromEntries(vocab.targets.map(t => [t.name, t.label]));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
// 진열대 가운데 책과 같은 순서 (src/app.js newestFirst)
export const newestFirst = (a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko');

// 색은 채널 이름표 색. 바탕은 서가와 같은 회녹색 종이(#EDF0EE). 크림색은 쓰지 않는다.
const COLOR = { orange: { me: '#b8703f', accent: '#93542A' }, green: { me: '#3d7f5c', accent: '#2F6B4C' } };
const fontDir = pathToFileURL(P('src', 'fonts')).href;
const CSS = c => `
@font-face{font-family:P;src:url('${fontDir}/Paperlogy-5Medium.woff2');font-weight:500}
@font-face{font-family:P;src:url('${fontDir}/Paperlogy-7Bold.woff2');font-weight:700}
@font-face{font-family:P;src:url('${fontDir}/Paperlogy-9Black.woff2');font-weight:900}
@font-face{font-family:M;src:url('${fontDir}/BookkMyungjo-Lt.woff2');font-weight:400}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#EDF0EE;color:#1E2421;font-family:P,sans-serif;position:relative}
.txt{position:absolute;left:72px;top:72px;width:640px;height:486px;display:flex;flex-direction:column}
/* 맨 위 '부부작당 │ 임지형': 사이트 머리줄처럼 가는 세로선으로 나눈다 */
.who{font-weight:700;font-size:26px;color:${c.accent};display:flex;align-items:center;gap:14px}
.who .ch{color:#1E2421}
.who i{display:block;width:2px;height:22px;background:currentColor;opacity:.35}
h1{font-weight:900;font-size:var(--fs,68px);line-height:1.16;letter-spacing:-.01em;margin-top:30px;word-break:keep-all;overflow-wrap:anywhere}
.one{font-family:M,serif;font-size:29px;line-height:1.5;margin-top:22px;word-break:keep-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin-top:auto;font-weight:500;font-size:23px;color:#5E6661}
.meta b{font-weight:700;color:#1E2421}
/* 트랙: 아래쪽을 가로지르는 선, 끝은 화살표 */
.lane{position:absolute;left:72px;right:72px;bottom:44px;height:4px;background:${c.me}}
.lane::after{content:"";position:absolute;right:-14px;top:-7px;width:16px;height:18px;background:${c.me};clip-path:polygon(0 0,100% 50%,0 100%)}
.cv{position:absolute;right:96px;top:50%;transform:translateY(-54%);max-height:470px;max-width:360px;border-radius:3px;box-shadow:0 2px 4px rgba(40,48,44,.18),0 22px 44px -10px rgba(40,48,44,.42)}
`;
const oneLine = b => (b.one || b.desc || '').replace(/\s+/g, ' ').trim();
function cardHtml(site, list, b, isSite) {
  const c = COLOR[site.color] || COLOR.orange;
  const cover = pathToFileURL(P('data', 'covers', b.cover)).href;
  // 맨 위 문구: 책 그림·서가 그림 모두 '부부작당 │ 임지형' (2026-11-08 사용자 결정. 사이트 머리줄과 같다)
  const who = `<span class="ch">${esc(CH.name)}</span><i></i><span>${esc(site.author)}</span>`;
  const title = isSite ? esc((site.role ? site.role + ' ' : '') + site.author) : esc(b.title);
  const one = isSite ? esc(site.tagline ? site.tagline.join('. ') : '') : esc(oneLine(b));
  const meta = isSite
    ? `작품 <b>${list.length}권</b> · 신간 <b>${esc(b.title)}</b>`
    : `<b>${esc(LABEL[b.tgt] || b.tgt)}</b>${b.cat && b.cat !== b.tgt && b.cat !== '일반' ? ' · ' + esc(b.cat) : ''} · ${b.y}년 · ${esc(b.pub)}`;
  return `<!doctype html><meta charset="utf-8"><style>${CSS(c)}</style>
<div class="txt"><p class="who">${who}</p><h1>${title}</h1><p class="one">${one}</p><p class="meta">${meta}</p></div>
<div class="lane"></div><img class="cv" src="${cover}">`;
}

const sites = fs.readdirSync(P('sites')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(P('sites', f), 'utf8')));
let browser = null, page = null, made = 0, kept = 0;
const tmp = P('.cache', 'og-card.html'); fs.mkdirSync(path.dirname(tmp), { recursive: true });
for (const site of sites) {
  if (only ? site.slug !== only : site.draft) continue;
  const list = books.filter(b => b.authors.includes(site.author));
  if (!list.length) continue;
  const dir = P('data', 'og', site.slug); fs.mkdirSync(dir, { recursive: true });
  const metaF = path.join(dir, 'og-meta.json');
  const old = fs.existsSync(metaF) ? JSON.parse(fs.readFileSync(metaF, 'utf8')) : {};
  const meta = {};
  const jobs = [[list.slice().sort(newestFirst)[0], true, 'site.jpg'], ...list.map(b => [b, false, (b.isbn || b.id) + '.jpg'])];
  for (const [b, isSite, file] of jobs) {
    const html = cardHtml(site, list, b, isSite);
    const key = sha(html + fs.statSync(P('data', 'covers', b.cover)).size + ':' + fs.statSync(P('data', 'covers', b.cover)).mtimeMs);
    meta[file] = key;
    if (old[file] === key && fs.existsSync(path.join(dir, file))) { kept++; continue; }
    if (!browser) { browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1200, height: 630 } }); }
    // 빈 페이지에서는 file:// 표지를 못 읽어서 임시 파일로 연다
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (await page.evaluate(() => { const i = document.querySelector('.cv'); return !i.complete || !i.naturalWidth; })) throw new Error(`표지를 못 읽었습니다: ${b.title} (${b.cover})`);
    // 제목이 두 줄을 넘으면 글자를 줄인다(68 → 최소 44px)
    await page.evaluate(() => { const h = document.querySelector('h1'); let fs = 68; while (h.getBoundingClientRect().height > fs * 1.16 * 2.05 && fs > 44) { fs -= 4; h.style.setProperty('--fs', fs + 'px'); } });
    await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 86 });
    made++;
  }
  // 목록에서 빠진 책의 그림은 지운다
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jpg') && !meta[f]) { fs.rmSync(path.join(dir, f)); console.log(`[${site.slug}] 지움: ${f}`); }
  fs.writeFileSync(metaF, JSON.stringify(meta, null, 1) + '\n');
  console.log(`[${site.slug}] 미리보기 그림 ${jobs.length}장 → data/og/${site.slug}/ (신간: ${jobs[0][0].title})`);
}
if (browser) await browser.close();
fs.rmSync(tmp, { force: true });
console.log(`새로 찍음 ${made}장, 그대로 ${kept}장`);
