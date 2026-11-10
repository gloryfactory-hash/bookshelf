// data/books.json + sites/*.json + src/ → dist/<slug>/
// 표지는 data/covers의 원본에서 큰 것(상세·진열대용)과 작은 것(격자·책등용) 두 벌을 만든다. 이미 만든 건 건너뛴다.
//
// 사용법:
//   node scripts/build.js              draft가 아닌 모든 서가
//   node scripts/build.js kimminsung   한 서가만 (draft여도 만든다)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';
import { sheetSvg, sweatSvg, heartSvg, FW, FH, ORDER } from './sprite.js';
import { shareBookOf, newestFirst } from './share.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(root, ...p);
const only = process.argv[2] || null;
const LARGE_H = 1000, THUMB_H = 360;

const books = JSON.parse(fs.readFileSync(P('data', 'books.json'), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(P('data', 'vocab.json'), 'utf8'));
const tpl = fs.readFileSync(P('src', 'index.html'), 'utf8');
const css = fs.readFileSync(P('src', 'style.css'), 'utf8');
const app = fs.readFileSync(P('src', 'app.js'), 'utf8');
const CH = JSON.parse(fs.readFileSync(P('data', 'channel.json'), 'utf8'));
const VER = crypto.createHash('sha1').update(css + app).digest('hex').slice(0, 8);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');

// 표지 처리 결과는 원본 파일 기준으로 캐시한다 (dist를 지워도 .cache는 남는다)
const CACHE = P('.cache', 'covers'); fs.mkdirSync(CACHE, { recursive: true });
async function cover(b) {
  const src = P('data', 'covers', b.cover);
  const stat = fs.statSync(src), key = `${b.id}-${stat.size}-${Math.round(stat.mtimeMs)}`;
  const metaF = path.join(CACHE, key + '.json'), L = path.join(CACHE, key + '.webp'), S = path.join(CACHE, key + '-s.webp');
  if (fs.existsSync(metaF) && fs.existsSync(L) && fs.existsSync(S)) return { meta: JSON.parse(fs.readFileSync(metaF, 'utf8')), L, S };
  const img = sharp(src).rotate();
  const { width: w, height: h } = await img.metadata();
  // 책등 색: 표지 왼쪽 가장자리 띠의 평균색
  const strip = await sharp(src).extract({ left: 0, top: Math.round(h * .15), width: Math.max(3, Math.round(w * .06)), height: Math.round(h * .7) }).stats();
  const [r, g, bl] = strip.channels.slice(0, 3).map(c => Math.round(c.mean));
  const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
  const meta = { a: +(w / h).toFixed(4), col: '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join(''), ink: lum > .58 ? '#1a1714' : '#f5f1e8', h };
  await sharp(src).rotate().resize({ height: LARGE_H, withoutEnlargement: true }).webp({ quality: 82 }).toFile(L);
  await sharp(src).rotate().resize({ height: THUMB_H, withoutEnlargement: true }).webp({ quality: 78 }).toFile(S);
  fs.writeFileSync(metaF, JSON.stringify(meta));
  return { meta, L, S };
}


// 부크크 명조는 한 벌이 1MB 가까이 되어, 그 서가 페이지에 실제로 나오는 글자만 남긴다.
const SERIF = [['BookkMyungjo-Lt.woff2'], ['BookkMyungjo-Bd.woff2']];
async function serifSubset(text, outDir) {
  const chars = [...new Set(text + '0123456789 .,·!?“”‘’\'"()~-–—:;/%')].sort().join('');
  const key = crypto.createHash('sha1').update(chars).digest('hex').slice(0, 10);
  for (const [f] of SERIF) {
    const cf = path.join(CACHE, '..', 'fonts', key + '-' + f);
    if (!fs.existsSync(cf)) {
      fs.mkdirSync(path.dirname(cf), { recursive: true });
      fs.writeFileSync(cf, await subsetFont(fs.readFileSync(P('src', 'fonts', f)), chars, { targetFormat: 'woff2' }));
    }
    fs.copyFileSync(cf, path.join(outDir, f));
  }
}

// 머리줄의 작가 전환 탭. 아직 draft인 서가는 숨긴다.
function whoTabs(site, sites) {
  return CH.authors.map(slug => sites.find(s => s.slug === slug)).filter(Boolean).map(s => {
    const cls = s.color === 'green' ? 'km' : 'lj';
    if (s.slug === site.slug) return `<a class="${cls}" href="./" aria-current="page"><i></i>${esc(s.author)}</a>`;
    if (s.draft) return ''; // 아직 공개 전인 서가는 탭을 숨긴다 (2026-11-08)
    return `<a class="${cls}" href="../${esc(s.slug)}/"><i></i>${esc(s.author)}</a>`;
  }).join('');
}

// 작가 화면(#about). 연계 도서는 이 서가에 있는 책·시리즈만 링크로 만든다.
function aboutHtml(site, list, photo) {
  const a = site.about; if (!a) return '';
  const bookLink = t => { const b = list.find(x => x.title === t); return b ? `<a href="#b-${esc(b.id)}">${esc(t)}</a>` : esc(t); };
  const seriesLink = t => list.some(x => x.series === t) ? `<a href="#books" data-series="${esc(t)}">${esc(t)} 시리즈</a>` : esc(t + ' 시리즈');
  const yrs = rows => '<ol class="yl">' + rows.map(([y, t]) => `<li><b>${esc(y)}</b><span>${esc(t)}</span></li>`).join('') + '</ol>';
  const talks = (a.talks || []).map(t => {
    const w = [...(t.series || []).map(seriesLink), ...(t.books || []).map(bookLink)];
    return `<li><span class="for">${esc(t.for)}</span><b>${esc(t.title)}</b>` + (t.when ? `<span class="when">${esc(t.when)} 잘 맞아요</span>` : '') + (w.length ? `<span class="with">연계 도서 ${w.join(', ')}${t.more ? ' 등' : ''}</span>` : '') + '</li>';
  }).join('');
  const c = a.contact || {};
  // 숫자 한 줄 (2026-11-08 의견서): 권수와 기관 선정·추천을 받은 책 수는 자료에서 센다(학년·주제 페이지와 같은 기준). 등단 해는 about.debut.
  const recN = list.filter(b => b.rec.some(x => !NOT_REC.test(x))).length;
  const stats = [[list.length, '권의 책'], ...(recN ? [[recN, '권 기관 선정·추천']] : []), ...(a.debut ? [[a.debut, '년 등단']] : [])];
  // 사진 (2026-11-09): 컴퓨터에서는 왼쪽 사진이 읽는 자리(소개·달리기·강연)에 따라 바뀐다(app.js).
  // 휴대폰에서는 위에 첫 사진만 두고, 나머지는 그 꼭지 안에 넣는다(.aphoto-m, 강연 사진 줄).
  const img = (p, lazy = true) => `<img src="assets/${p.file}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
  const side = photo.side;
  const inline = at => side.filter(p => p.at === at).map(p => `<figure class="aphoto-m">${img(p)}<figcaption>${esc(p.alt)}</figcaption></figure>`).join('');
  const strip = photo.talk.length ? `<div class="tphotos">${photo.talk.map(p => `<figure${p.mobileOnly ? ' class="m"' : ''}>${img(p)}<figcaption>${esc(p.alt)}</figcaption></figure>`).join('')}</div>` : '';
  return `<section class="about" id="about" hidden aria-labelledby="aTitle">
  <div class="ain">
    ${side.length ? `<figure class="aphoto"><div class="aframe">${side.map((p, i) => img(p, i > 0).replace('<img ', `<img data-at="${esc(p.at || 'intro')}"${i ? '' : ' class="on"'} `)).join('')}</div><figcaption>${esc(side[0].alt)}</figcaption></figure>` : ''}
    <div class="atext">
      <p class="akick">작가 소개</p>
      <h1 class="aquote" id="aTitle">“${esc(a.quote)}”</h1>
      <p class="alead">${esc(a.lead)}</p>
      <ul class="astats">${stats.map(([n, l]) => `<li><b>${esc(n)}</b>${esc(l)}</li>`).join('')}</ul>
      <div class="abio">${(a.bio || []).map(p => `<p>${esc(p)}</p>`).join('')}</div>
      ${a.run ? `${inline('run')}<section class="arun">${site.runner ? '<div class="artk" aria-hidden="true"></div><div class="arme" aria-hidden="true"><i class="sw"></i><i class="rn"></i></div>' : ''}<h2>${esc(a.run.title)}</h2><p>${esc(a.run.text)}</p></section>` : ''}
      ${a.history ? `<section class="asec"><h2>걸어온 길</h2>${yrs(a.history)}${a.judging ? `<details class="judge"><summary>심사 이력 ${a.judging.length}건</summary>${yrs(a.judging)}</details>` : ''}</section>` : ''}
      ${talks ? `<section class="asec" id="talk"><h2>강연</h2>${a.talkIntro ? `<p class="anote">${esc(a.talkIntro)}</p>` : ''}${strip}<ul class="talks">${talks}</ul>${a.talkCareer ? '<ul class="career">' + a.talkCareer.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}</section>` : ''}
      ${c.email || c.form ? `<section class="asec acontact" id="contact"><h2>강연·협업 문의</h2>${c.text ? `<p>${esc(c.text)}</p>` : ''}<div class="cbtn">${c.form ? `<a class="pri" href="${esc(c.form)}" target="_blank" rel="noopener">문의 폼 작성하기</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div><p class="ch">작가의 일상과 책 이야기는 유튜브 채널 <a href="${esc(CH.youtube)}" target="_blank" rel="noopener">${esc(CH.name)}</a>에서 만나요.</p></section>` : ''}
      <div class="libfoot lbl"><span>© ${esc(site.author)} · ${esc(CH.name)}</span><a href="news/">새 책 소식 받기</a></div>
    </div>
  </div>
</section>`;
}

// ---------- 검색엔진용 (2026-11-08, 사용자 "1번 해") ----------
// 책 페이지는 화면을 자바스크립트가 그리지만, 검색엔진(특히 네이버)이 읽도록 상세 칸에 같은 내용을 글자로 미리 채워 둔다.
// 화면 모습은 그대로다: 상세 칸은 숨긴 채로 두고, app.js가 열 때 같은 자리를 다시 채운다(fillDetail).
const AGE = Object.fromEntries(vocab.targets.map(t => [t.name, t.label]));
function staticDetail(h, b, topicHref = () => null) {
  const fill = (open, inner) => { if (!h.includes(open + '</')) throw new Error('상세 칸 자리를 못 찾음: ' + open); h = h.replace(open + '</', () => open + inner + '</'); };
  fill('<span class="dsub" id="dSub">', esc(b.tgt + ' / ' + b.cat + (b.series ? ' / ' + b.series + ' 시리즈' : '')));
  fill('<h2 class="dtitle" id="dTitle">', esc(b.title));
  fill('<p class="done" id="dOne">', esc(b.one));
  fill('<div class="dkw" id="dKw">', b.kw.map(k => topicHref(k) ? `<a href="${esc(topicHref(k))}">${esc(k)}</a>` : `<span>${esc(k)}</span>`).join(''));
  fill('<p class="dsyn" id="dSyn">', esc(b.desc));
  if (b.rec.length) fill('<div class="drec" id="dRec">', '<h3>추천·선정</h3><ul>' + b.rec.map(r => `<li>${esc(r)}</li>`).join('') + '</ul>');
  const age = AGE[b.tgt], rows = [['지은이', b.authors.join(', ')], ['대상', b.tgt + (age && age !== b.tgt ? ` (${age})` : '')]];
  if (b.cat && b.cat !== '일반' && b.cat !== b.tgt) rows.push(['분류', b.cat]);
  rows.push(['출간', b.ed ? `${b.y}년 첫 출간, ${b.ed}년 개정판` : `${b.y}년`]);
  if (b.pages) rows.push(['쪽수', b.pages + '쪽']);
  rows.push(['출판사', b.pub]); if (b.isbn) rows.push(['ISBN', b.isbn]);
  fill('<div class="dbib" id="dBib">', '<h3>도서 정보</h3><dl>' + rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') + '</dl>');
  const shops = [['yes24', 'YES24'], ['kyobo', '교보문고'], ['aladin', '알라딘']].filter(([k]) => /^https:\/\//.test(b.links[k] || ''));
  if (shops.length) fill('<div class="dbuy" id="dBuy">', '<h3>서점에서 보기</h3><div class="shops">' + shops.map(([k, l]) => `<a href="${esc(b.links[k])}" target="_blank" rel="noopener">${esc(l)}</a>`).join('') + '</div>');
  return h;
}
// 책 정보 구조화 데이터(schema.org Book). 검색 결과에 책 정보로 보이게 돕는다.
const bookLd = (b, URL0, key, hasImg) => '<script type="application/ld+json">' + safeJson({
  '@context': 'https://schema.org', '@type': 'Book', name: b.title, url: URL0 + key + '/',
  author: b.authors.map(n => ({ '@type': 'Person', name: n })), inLanguage: 'ko', genre: b.cat,
  audience: { '@type': 'Audience', audienceType: b.tgt + (AGE[b.tgt] && AGE[b.tgt] !== b.tgt ? ` (${AGE[b.tgt]})` : '') },
  keywords: b.kw.join(', '), description: b.desc, datePublished: String(b.y),
  ...(b.isbn ? { isbn: b.isbn } : {}), ...(b.pages ? { numberOfPages: b.pages } : {}),
  publisher: { '@type': 'Organization', name: b.pub }, ...(hasImg ? { image: URL0 + 'og/' + key + '.jpg' } : {}),
}) + '</script>';
// 없는 주소 화면. Cloudflare Pages는 404.html이 없으면 아무 주소에나 첫 화면을 200으로 보내(검색엔진에는 같은 페이지가 끝없이 보임) 따로 둔다.
const notFound = (title, links) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없어요 · ${esc(title)}</title>
<style>:root{--p:#EDF0EE;--i:#1E2421;--m:#5E6661;--a:#93542A;color-scheme:light}@media (prefers-color-scheme:dark){:root{--p:#171B19;--i:#E9ECE9;--m:#A2AAA5;--a:#E0A274;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--p);color:var(--i);font-family:'Pretendard',system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:420px}h1{margin:0 0 12px;font-size:22px;color:var(--a)}p{margin:0 0 24px;line-height:1.6;color:var(--m)}
a{display:inline-flex;align-items:center;height:44px;padding:0 18px;border:1px solid var(--a);background:var(--a);color:var(--p);font-weight:700;text-decoration:none;margin:0 8px 8px 0}</style></head>
<body><main><h1>이 주소에는 페이지가 없어요</h1><p>주소가 바뀌었거나 잘못 입력되었을 수 있어요.</p>${links.map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join('')}</main></body></html>`;

// ---------- 학년·주제 페이지 (2026-11-08, 사용자 "학년, 주제별 페이지" · 한글 주소) ----------
// 주소: <서가>/3-4학년/, <서가>/주제/가족/. 책이 MIN_PAGE권 이상인 학년·주제만 만든다(빈약한 페이지는 검색에도 좋지 않다).
// 화면은 '전체 작품'(서고)을 그 조건으로 연 것과 같다. 검색엔진이 읽도록 제목·소개·책 목록·나눠 보기를 글자로 미리 채운다.
// app.js는 SITE.pages(아래 pages의 k·p·h·t·gh·g)로 같은 화면을 그리고, 서고에서 조건을 바꾸면 주소도 맞춰 바꾼다.
const MIN_PAGE = 3;
const NOT_REC = /MD 추천|언론 추천|한우리|기금 지원|대출 1위/;
const topicSlug = k => k.replace(/·/g, '-').replace(/\s+/g, '-');
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };
function landingPages(site, list) {
  const sorted = list.slice().sort(newestFirst);
  const gOK = new Set(vocab.targets.filter(t => list.filter(b => b.tgt === t.name).length >= MIN_PAGE).map(t => t.name));
  const kOK = new Set(vocab.keywords.filter(k => list.filter(b => b.kw.includes(k)).length >= MIN_PAGE));
  // 실제 선정·추천 이력만 센다 (books.json rec). 서점 MD·언론 추천, 기금 지원, 대출 순위는 빼고(교사·사서가 믿는 기관 추천만),
  // 많이 받은 이름 둘을 예로 든다
  const recOf = b => b.rec.filter(x => !NOT_REC.test(x));
  const recLine = bs => {
    const r = bs.filter(b => recOf(b).length); if (!r.length) return '';
    const cnt = new Map(); for (const x of r.flatMap(recOf)) cnt.set(x, (cnt.get(x) || 0) + 1);
    const top = [...cnt].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, 2).map(x => x[0]);
    return ` ${r.length === bs.length ? `${r.length}권 모두` : `그중 ${r.length}권은`} ${top.length > 1 ? top.join(', ') + ' 같은 기관의 선정·추천을' : josa(top[0], '을', '를')} 받았어요.`;
  };
  const pages = [];
  for (const t of vocab.targets) {
    if (!gOK.has(t.name)) continue;
    const bs = sorted.filter(b => b.tgt === t.name);
    const cc = new Map(); for (const b of bs) if (b.cat && b.cat !== '일반') cc.set(b.cat, (cc.get(b.cat) || 0) + 1);
    const cats = [...cc].sort((a, b) => b[1] - a[1]).map(x => x[0]); // 많은 갈래부터: '1~2학년 동화·그림책'
    const h = t.name === '일반' ? '어른을 위한 책' : t.name === '청소년' ? (cats.length === 1 ? cats[0] : '청소년 책') : `${t.short} ${cats.join('·') || '책'}`;
    const g = vocab.keywords.map(k => [k, bs.filter(b => b.kw.includes(k))]).filter(([, x]) => x.length >= 2)
      .sort((a, b) => b[1].length - a[1].length).map(([k, x]) => [k, kOK.has(k) ? 'k-' + k : null, x.map(b => b.id)]);
    pages.push({ k: 'g-' + t.name, p: t.slug, h, t: `${josa(t.label, '을', '를')} 위한 ${site.author} 작가의 책 ${bs.length}권이에요.` + recLine(bs), gh: '주제로 나눠 보기', g, books: bs });
  }
  for (const k of vocab.keywords) {
    if (!kOK.has(k)) continue;
    const bs = sorted.filter(b => b.kw.includes(k));
    const g = vocab.targets.map(t => [t, bs.filter(b => b.tgt === t.name)]).filter(([, x]) => x.length)
      .map(([t, x]) => [t.short, gOK.has(t.name) ? 'g-' + t.name : null, x.map(b => b.id)]);
    pages.push({ k: 'k-' + k, p: '주제/' + topicSlug(k), h: k + ' 이야기', t: `'${josa(k, "'을", "'를")} 다룬 ${site.author} 작가의 책 ${bs.length}권이에요.` + recLine(bs), gh: '학년으로 나눠 보기', g, books: bs });
  }
  return pages;
}
// 학년·주제 페이지의 미리 채운 글자 (app.js renderLib·renderSub와 같은 모양)
function landingStatic(h, pg, byId, keyOf, pageOf) {
  const fill = (a, b) => { if (!h.includes(a)) throw new Error('서고 자리를 못 찾음: ' + a); h = h.replace(a, () => b); };
  fill('<section class="lib" id="lib" hidden aria-label="전체 작품">', `<section class="lib" id="lib" aria-label="${esc(pg.h)}">`);
  fill('<span id="libH">전체 작품</span><span class="n" id="libN"></span>', `<span id="libH">${esc(pg.h)}</span><span class="n" id="libN">${pg.books.length}권</span>`);
  fill('<p class="lintro" id="libIntro" hidden></p>', `<p class="lintro" id="libIntro">${esc(pg.t)}</p>`);
  fill('<div class="grid" id="grid"></div>', '<div class="grid" id="grid">' + pg.books.map(b =>
    `<a class="card" href="${esc(keyOf(b))}/" data-go="b-${esc(b.id)}"><div class="cvr"><img src="covers/${esc(b.id)}-s.webp?v=${VER}" alt="" loading="lazy" decoding="async"></div><div class="t">${esc(b.title)}</div><div class="o">${esc(b.one)}</div><div class="mt">${esc(b.tgt)} / ${b.y}</div></a>`).join('') + '</div>');
  if (pg.g.length) fill('<section class="lsub" id="libSub" hidden></section>', `<section class="lsub" id="libSub"><h2>${esc(pg.gh)}</h2>` + pg.g.map(([label, key, ids]) =>
    `<div class="lrow"><h3>${key ? `<a href="${esc(pageOf(key))}/" data-go="${esc(key)}">${esc(label)}</a>` : esc(label)}<span class="n">${ids.length}권</span></h3><ul>` +
    ids.map(id => byId.get(id)).map(b => `<li><a href="${esc(keyOf(b))}/" data-go="b-${esc(b.id)}">${esc(b.title)}</a></li>`).join('') + '</ul></div>').join('') + '</section>');
  return h;
}

const sites = fs.readdirSync(P('sites')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(P('sites', f), 'utf8')));
const built = [];
for (const site of sites) {
  if (only ? site.slug !== only : site.draft) continue;
  const list = books.filter(b => b.authors.includes(site.author));
  if (!list.length) { console.warn(`[${site.slug}] '${site.author}' 작가의 책이 없어 건너뜁니다.`); continue; }
  const out = P('dist', site.slug);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'covers'), { recursive: true }); fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  const data = [];
  let small = 0;
  for (const b of list) {
    const c = await cover(b);
    if (c.meta.h < 700) small++;
    fs.copyFileSync(c.L, path.join(out, 'covers', b.id + '.webp'));
    fs.copyFileSync(c.S, path.join(out, 'covers', b.id + '-s.webp'));
    const { cover: _c, ...rest } = b;
    data.push({ ...rest, a: c.meta.a, col: c.meta.col, ink: c.meta.ink, img: `covers/${b.id}.webp?v=${VER}`, thumb: `covers/${b.id}-s.webp?v=${VER}` });
  }
  // 글꼴(페이퍼로지는 통째로, 부크크 명조는 줄여서)과 작가 사진
  fs.mkdirSync(path.join(out, 'assets', 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(P('src', 'fonts'))) if (f.startsWith('Paperlogy')) fs.copyFileSync(P('src', 'fonts', f), path.join(out, 'assets', 'fonts', f));
  // 작가 사진 (2026-11-09): photos는 왼쪽에 붙은 사진 묶음(읽는 자리에 따라 바뀜), talkPhotos는 강연 꼭지의 사진 줄.
  // 예전 설정(photo 하나)도 그대로 읽는다. 아이 얼굴은 data/media에 넣기 전에 가리거나 잘라 낸다.
  const ab = site.about || {};
  const srcPhotos = ab.photos || (ab.photo ? [{ src: ab.photo, alt: ab.photoAlt || '', at: 'intro' }] : []);
  const pic = async (p, name, size) => {
    const r = await sharp(P(p.src)).rotate().resize({ ...size, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(out, 'assets', name));
    return { ...p, file: name, w: r.width, h: r.height };
  };
  const photo = { side: [], talk: [] };
  for (const [i, p] of srcPhotos.entries()) photo.side.push(await pic(p, `author-${i + 1}.webp`, { height: 1200 }));
  for (const [i, p] of (ab.talkPhotos || []).entries()) photo.talk.push(await pic(p, `talk-${i + 1}.webp`, { width: 1200 }));
  const pages = landingPages(site, list);
  const siteData = { pages: pages.map(({ books: _b, ...p }) => p), runner: !!site.runner, lead: site.leadBook ? shareBookOf(site, list).id : null, author: site.author, spineName: site.spineName || site.author, recentYears: site.recentYears || 2, recentCount: site.recentCount || null, note: site.note || '', targets: vocab.targets, keywords: vocab.keywords };
  const html = tpl
    .replaceAll('{{TITLE}}', esc(site.title))
    .replaceAll('{{DESCRIPTION}}', esc(site.description || `${site.author} 작가의 작품 ${list.length}권을 대상 학년과 주제로 찾아볼 수 있는 서가`))
    .replaceAll('{{FAVICON}}', encodeURIComponent(site.favicon || '📚'))
    .replaceAll('{{AUTHOR}}', esc(site.author))
    .replaceAll('{{BRAND_SUB}}', esc(site.brandSub || '작품 서가'))
    .replaceAll('{{KAN_L}}', esc(site.kan?.[0] || ''))
    .replaceAll('{{KAN_R}}', esc(site.kan?.[1] || ''))
    .replaceAll('{{ME}}', site.color === 'green' ? 'green' : 'orange')
    .replaceAll('{{RUNNER}}', site.runner ? ' data-runner' : '') // 트랙 위 도트 캐릭터 (2026-11-08). 지금은 임지형 서가만
    .replaceAll('{{CHANNEL}}', esc(CH.name))
    .replaceAll('{{YOUTUBE}}', esc(CH.youtube))
    .replaceAll('{{NEWS}}', 'news/') // 서가 안 소개 쪽(2026-11-11). 그 쪽 단추가 스티비로 넘긴다
    .replace('{{WHO}}', () => whoTabs(site, sites))
    // 첫 화면 제목: '동화 작가 임지형'(role이 있으면) + 한 줄 소개(tagline이 있으면). 2026-11-08
    .replace('{{TAGLINE}}', () => `<div class="ttl"><h1>${site.role ? `<span class="role">${esc(site.role)}</span>` : ''}${esc(site.author)}</h1>` +
      (site.tagline ? `<p><b>${esc(site.tagline[0])}</b>${esc(site.tagline[1] || '')}</p>` : '') + '</div>')
    .replace('{{NAV_ABOUT}}', () => site.about ? '<button id="navAbout" aria-pressed="false">작가 소개</button>' : '')
    .replace('{{FOOT_TALK}}', () => site.about?.contact ? '<a class="talk" href="#contact">강연 문의</a>' : '')
    .replace('{{ABOUT}}', () => aboutHtml(site, list, photo))
    .replaceAll('{{VER}}', VER)
    .replace('{{BOOKS_JSON}}', () => safeJson(data))
    .replace('{{SITE_JSON}}', () => safeJson(siteData));
  // 책 주소와 미리보기 태그 (2026-11-08, 시안 시안/address_v1 가안)
  //   dist/<slug>/<ISBN>/index.html: 서가 전체 페이지에 <base href="../">와 그 책의 제목·미리보기 태그를 넣은 것.
  //   주소창을 그대로 복사해도 카카오톡에 그 책 미리보기가 뜬다. 미리보기 그림은 npm run og가 data/og에 만들어 둔 것을 복사한다.
  const ogSrc = P('data', 'og', site.slug), ogOut = path.join(out, 'og');
  if (fs.existsSync(ogSrc)) { fs.mkdirSync(ogOut, { recursive: true }); for (const f of fs.readdirSync(ogSrc)) if (f.endsWith('.jpg')) fs.copyFileSync(path.join(ogSrc, f), path.join(ogOut, f)); }
  const hasOg = f => fs.existsSync(path.join(ogOut, f));
  const keyOf = b => b.isbn || b.id;
  const URL0 = site.url ? site.url.replace(/\/?$/, '/') : null; // 배포 주소. 미리보기 그림 태그는 전체 주소가 있어야 한다
  const ogTags = ({ type, title, desc, pagePath, img }) => [
    // 검색 사이트 소유 확인 태그 (sites/<slug>.json의 verify: { naver, google })
    ...Object.entries(site.verify || {}).map(([k, v]) => `<meta name="${k}-site-verification" content="${esc(v)}">`),
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(site.title)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    ...(URL0 ? [`<meta property="og:url" content="${esc(URL0 + pagePath)}">`, `<link rel="canonical" href="${esc(URL0 + pagePath)}">`] : []),
    // 그림 주소 끝 ?v=는 그림 내용으로 정한다: 그림만 바뀌어도(예: 서가 미리보기 책을 바꿈) 카톡이 새 그림을 가져가게
    ...(URL0 && hasOg(img) ? [`<meta property="og:image" content="${esc(URL0 + 'og/' + img)}?v=${crypto.createHash('sha1').update(fs.readFileSync(path.join(ogOut, img))).digest('hex').slice(0, 8)}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">', '<meta name="twitter:card" content="summary_large_image">'] : [])
  ].join('\n');
  const noPh = h => { if (/\{\{[A-Z_]+\}\}/.test(h)) throw new Error('채워지지 않은 자리표시자가 있습니다: ' + h.match(/\{\{[A-Z_]+\}\}/)[0]); return h; };
  const newest = shareBookOf(site, list); // 서가 미리보기 설명의 '신간 『…』'. leadBook이 있으면 그 책(scripts/og.js와 같은 규칙)
  const siteDesc = site.description || `${site.author} 작가의 작품 ${list.length}권을 대상 학년과 주제로 찾아볼 수 있는 서가`;
  fs.writeFileSync(path.join(out, 'index.html'), noPh(html
    .replace('{{BASE}}', '<base href="./">') // 기준 주소를 처음에 고정한다. 서가 안에서 책 주소로 옮겨 가도 표지·글꼴 경로가 서가 뿌리 기준으로 남는다
    .replace('{{OG}}', () => ogTags({ type: 'website', title: `${site.role ? site.role + ' ' : ''}${site.author} · ${site.brandSub || '작품 서가'}`, desc: `신간 『${newest.title}』 · ${siteDesc}`, pagePath: '', img: 'site.jpg' }) +
      (URL0 ? '\n<script type="application/ld+json">' + safeJson({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.title, url: URL0, inLanguage: 'ko', description: siteDesc,
        about: { '@type': 'Person', name: site.author, ...(site.role ? { jobTitle: site.role } : {}) } }) + '</script>' : ''))
    // 자바스크립트 없이 읽는 검색엔진을 위한 책 목록(화면에는 보이지 않는다)
    .replace('</body>', () => '<noscript><nav aria-label="전체 작품 목록"><h2>' + esc(site.author) + ' 전체 작품</h2><ul>' +
      list.slice().sort((a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko')).map(b => `<li><a href="${esc(keyOf(b))}/">${esc(b.title)}</a> (${esc(b.tgt)}, ${b.y})</li>`).join('') + '</ul></nav>' +
      (pages.length ? '<nav aria-label="학년·주제로 찾기"><h2>학년·주제로 찾기</h2><ul>' + pages.map(pg => `<li><a href="${esc(pg.p)}/">${esc(pg.h)}</a> (${pg.books.length}권)</li>`).join('') + '</ul></nav>' : '') + '</noscript>\n</body>')));
  const noOg = [];
  for (const b of list) {
    const k = keyOf(b), d = path.join(out, k);
    if (!hasOg(k + '.jpg')) noOg.push(b.title);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), noPh(staticDetail(html, b, k => pages.some(pg => pg.k === 'k-' + k) ? '주제/' + topicSlug(k) + '/' : null)
      // 끝 '/' 없이 들어오면(서버에 따라) 그림 경로가 어긋나므로 '/'를 붙여 다시 연다
      .replace('{{BASE}}', () => `<script>if(!location.pathname.endsWith('/'))location.replace(location.pathname+'/'+location.search+location.hash)</script>\n<base href="../">`)
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(b.title)} · ${esc(site.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(`${b.one} ${b.authors.join(', ')} 작가의 ${b.tgt}${b.cat && b.cat !== b.tgt ? ' ' + b.cat : ''}(${b.y}). 주제: ${b.kw.join(', ')}.`)}">`)
      .replace('{{OG}}', () => ogTags({ type: 'book', title: `${b.title} · ${site.author}`, desc: b.one, pagePath: k + '/', img: k + '.jpg' }) + (URL0 ? '\n' + bookLd(b, URL0, k, hasOg(k + '.jpg')) : ''))));
  }
  // 학년·주제 페이지: dist/<slug>/3-4학년/index.html, dist/<slug>/주제/가족/index.html
  const byId = new Map(list.map(b => [b.id, b])), pageOf = key => pages.find(pg => pg.k === key).p;
  for (const pg of pages) {
    const d = path.join(out, ...pg.p.split('/')), up = '../'.repeat(pg.p.split('/').length);
    fs.mkdirSync(d, { recursive: true });
    const desc = pg.t + ' ' + pg.g.map(([l, , ids]) => `${l} ${ids.length}권`).join(', ') + '.';
    fs.writeFileSync(path.join(d, 'index.html'), noPh(landingStatic(html, pg, byId, keyOf, pageOf)
      .replace('{{BASE}}', () => `<script>if(!location.pathname.endsWith('/'))location.replace(location.pathname+'/'+location.search+location.hash)</script>\n<base href="${up}">`)
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(pg.h)} · ${esc(site.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(desc)}">`)
      .replace('{{OG}}', () => ogTags({ type: 'website', title: `${pg.h} · ${site.author}`, desc: pg.t, pagePath: encodeURI(pg.p) + '/', img: 'site.jpg' }) +
        (URL0 ? '\n<script type="application/ld+json">' + safeJson({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${pg.h} · ${site.title}`, url: URL0 + encodeURI(pg.p) + '/', inLanguage: 'ko', description: pg.t,
          mainEntity: { '@type': 'ItemList', numberOfItems: pg.books.length, itemListElement: pg.books.map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: URL0 + keyOf(b) + '/', name: b.title })) } }) + '</script>' : ''))));
  }
  // 검색엔진에 알리는 파일: sitemap.xml(첫 화면 + 책 주소 전부), robots.txt, 없는 주소 화면 404.html
  if (URL0) {
    const urls = [URL0, URL0 + 'news/', ...pages.map(pg => URL0 + encodeURI(pg.p) + '/'), ...list.map(b => URL0 + keyOf(b) + '/')];
    fs.writeFileSync(path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => `<url><loc>${esc(u)}</loc></url>`).join('\n') + '\n</urlset>\n');
    fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${URL0}sitemap.xml\n`);
  }
  // 새 책 소식 소개 쪽 (2026-11-11, 시안 시안/새책소식_v1/). 부부작당 공용 소식, 단추는 스티비 구독 화면으로
  {
    const recent = [...list].sort((a, b) => String(b.y).localeCompare(String(a.y))).slice(0, 4);
    // sites/<slug>.json의 newsCovers(책 ID, 자리 순서: 왼쪽 뒤·가운데 뒤·오른쪽·맨 앞)가 있으면 그대로, 없으면 최근 책 4권
    const order = site.newsCovers ? site.newsCovers.map(id => { const b = list.find(x => x.id === id || x.isbn === id); if (!b) throw new Error(`newsCovers의 ${id} 책이 없습니다`); return b; })
      : [1, 0, 2, 3].map(i => recent[i]).filter(Boolean);
    fs.mkdirSync(path.join(out, 'news'), { recursive: true });
    fs.writeFileSync(path.join(out, 'news', 'index.html'), noPh(fs.readFileSync(P('src', 'news.html'), 'utf8')
      .replace('{{OG}}', () => URL0 ? `<link rel="canonical" href="${esc(URL0)}news/">` : '')
      .replaceAll('{{AUTHOR}}', esc(site.author))
      .replaceAll('{{STIBEE}}', esc(CH.news))
      .replaceAll('{{FROM}}', esc(CH.newsFrom || CH.name))
      .replace('{{COVERS}}', () => order.map(b => `<figure><img src="../covers/${b.id}.webp?v=${VER}" alt="${esc(b.title)} 표지"><figcaption>${esc(b.title)}</figcaption></figure>`).join(''))));
  }
  fs.writeFileSync(path.join(out, '404.html'), notFound(site.title, [[URL0 || './', site.title + ' 첫 화면으로']]));
  if (!URL0) console.warn(`[${site.slug}] 배포 주소(sites/${site.slug}.json의 "url")가 없어 미리보기 그림 태그를 넣지 않았습니다. 카카오톡 미리보기에 그림이 뜨지 않습니다.`);
  if (noOg.length) console.warn(`[${site.slug}] 미리보기 그림이 없는 책 ${noOg.length}권: ${noOg.slice(0, 5).join(', ')}${noOg.length > 5 ? ' …' : ''} → npm run og`);
  await serifSubset(html.replace(/<[^>]+>/g, ''), path.join(out, 'assets', 'fonts'));
  fs.writeFileSync(path.join(out, 'assets', 'style.css'), css);
  fs.writeFileSync(path.join(out, 'assets', 'app.js'), app);
  // 트랙 위 작가 도트 캐릭터 그림 (scripts/sprite.js). style.css의 칸 위치 값은 14×16칸 × 2배, ORDER 순서에 맞춰 적어 두었다
  if (site.runner) {
    if (FW !== 14 || FH !== 16 || ORDER.join() !== 'run1,run2,run3,run4,stand,wave1,wave2,strA1,strA2,strB,front,kiss') throw new Error('sprite.js의 칸 크기나 순서가 바뀌었습니다. style.css의 캐릭터 위치 값도 함께 고치세요.');
    fs.writeFileSync(path.join(out, 'assets', 'runner.svg'), sheetSvg());
    fs.writeFileSync(path.join(out, 'assets', 'sweat.svg'), sweatSvg());
    fs.writeFileSync(path.join(out, 'assets', 'heart.svg'), heartSvg());
  }
  built.push(site);
  console.log(`[${site.slug}] ${list.length}권 → dist/${site.slug}/` + (small ? `  (세로 700px 미만 표지 ${small}장: 큰 표지로 바꾸면 상세 화면이 선명해집니다)` : ''));
}
if (!only) {
  const links = built.map(s => `<li><a href="${esc(s.slug)}/">${esc(s.title)}</a></li>`).join('');
  fs.writeFileSync(P('dist', 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>작품 서가</title>` +
    (built.length === 1 ? `<meta http-equiv="refresh" content="0; url=${esc(built[0].slug)}/">` : '') +
    `<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px}a{color:#1F3FB0}</style><h1>작품 서가</h1><ul>${links}</ul>`);
  fs.writeFileSync(P('dist', '.nojekyll'), '');
  fs.writeFileSync(P('dist', '404.html'), notFound('작품 서가', built.map(s => [s.url || s.slug + '/', s.title])));
}
