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
    return `<li><span class="for">${esc(t.for)}</span><b>${esc(t.title)}</b>` + (w.length ? `<span class="with">연계 도서 ${w.join(', ')}${t.more ? ' 등' : ''}</span>` : '') + '</li>';
  }).join('');
  const c = a.contact || {};
  return `<section class="about" id="about" hidden aria-labelledby="aTitle">
  <div class="ain">
    ${photo ? `<figure class="aphoto"><img src="assets/${photo.file}" width="${photo.w}" height="${photo.h}" alt="${esc(a.photoAlt || '')}" loading="lazy" decoding="async"><figcaption>${esc(a.photoAlt || '')}</figcaption></figure>` : ''}
    <div class="atext">
      <p class="akick">작가 소개</p>
      <h1 class="aquote" id="aTitle">“${esc(a.quote)}”</h1>
      <p class="alead">${esc(a.lead)}</p>
      <div class="abio">${(a.bio || []).map(p => `<p>${esc(p)}</p>`).join('')}</div>
      ${a.run ? `<section class="arun"><h2>${esc(a.run.title)}</h2><p>${esc(a.run.text)}</p></section>` : ''}
      ${a.history ? `<section class="asec"><h2>걸어온 길</h2>${yrs(a.history)}${a.judging ? `<details class="judge"><summary>심사 이력 ${a.judging.length}건</summary>${yrs(a.judging)}</details>` : ''}</section>` : ''}
      ${talks ? `<section class="asec" id="talk"><h2>강연</h2>${a.talkIntro ? `<p class="anote">${esc(a.talkIntro)}</p>` : ''}<ul class="talks">${talks}</ul>${a.talkCareer ? '<ul class="career">' + a.talkCareer.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}</section>` : ''}
      ${c.email || c.form ? `<section class="asec acontact" id="contact"><h2>강연·협업 문의</h2>${c.text ? `<p>${esc(c.text)}</p>` : ''}<div class="cbtn">${c.form ? `<a class="pri" href="${esc(c.form)}" target="_blank" rel="noopener">문의 폼 작성하기</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div><p class="ch">작가의 일상과 책 이야기는 유튜브 채널 <a href="${esc(CH.youtube)}" target="_blank" rel="noopener">${esc(CH.name)}</a>에서 만나요.</p></section>` : ''}
      <div class="libfoot lbl"><span>© ${esc(site.author)} · ${esc(CH.name)}</span><a href="${esc(CH.news)}" target="_blank" rel="noopener">새 책 소식 받기</a></div>
    </div>
  </div>
</section>`;
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
  let photo = null;
  if (site.about?.photo) {
    const r = await sharp(P(site.about.photo)).rotate().resize({ height: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(out, 'assets', 'author.webp'));
    photo = { file: 'author.webp', w: r.width, h: r.height };
  }
  const siteData = { author: site.author, spineName: site.spineName || site.author, recentYears: site.recentYears || 2, recentCount: site.recentCount || null, note: site.note || '', targets: vocab.targets, keywords: vocab.keywords };
  const html = tpl
    .replaceAll('{{TITLE}}', esc(site.title))
    .replaceAll('{{DESCRIPTION}}', esc(site.description || `${site.author} 작가의 작품 ${list.length}권을 대상 학년과 주제로 찾아볼 수 있는 서가`))
    .replaceAll('{{FAVICON}}', encodeURIComponent(site.favicon || '📚'))
    .replaceAll('{{AUTHOR}}', esc(site.author))
    .replaceAll('{{BRAND_SUB}}', esc(site.brandSub || '작품 서가'))
    .replaceAll('{{KAN_L}}', esc(site.kan?.[0] || ''))
    .replaceAll('{{KAN_R}}', esc(site.kan?.[1] || ''))
    .replaceAll('{{ME}}', site.color === 'green' ? 'green' : 'orange')
    .replaceAll('{{CHANNEL}}', esc(CH.name))
    .replaceAll('{{YOUTUBE}}', esc(CH.youtube))
    .replaceAll('{{NEWS}}', esc(CH.news))
    .replace('{{WHO}}', () => whoTabs(site, sites))
    // 첫 화면 제목: '동화 작가 임지형'(role이 있으면) + 한 줄 소개(tagline이 있으면). 2026-11-08
    .replace('{{TAGLINE}}', () => `<div class="ttl"><h1>${site.role ? `<span class="role">${esc(site.role)}</span>` : ''}${esc(site.author)}</h1>` +
      (site.tagline ? `<p><b>${esc(site.tagline[0])}</b>${esc(site.tagline[1] || '')}</p>` : '') + '</div>')
    .replace('{{NAV_ABOUT}}', () => site.about ? '<button id="navAbout" aria-pressed="false">작가</button>' : '')
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
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${esc(site.title)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    ...(URL0 ? [`<meta property="og:url" content="${esc(URL0 + pagePath)}">`, `<link rel="canonical" href="${esc(URL0 + pagePath)}">`] : []),
    ...(URL0 && hasOg(img) ? [`<meta property="og:image" content="${esc(URL0 + 'og/' + img)}?v=${VER}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">', '<meta name="twitter:card" content="summary_large_image">'] : [])
  ].join('\n');
  const noPh = h => { if (/\{\{[A-Z_]+\}\}/.test(h)) throw new Error('채워지지 않은 자리표시자가 있습니다: ' + h.match(/\{\{[A-Z_]+\}\}/)[0]); return h; };
  const newest = list.slice().sort((a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko'))[0];
  const siteDesc = site.description || `${site.author} 작가의 작품 ${list.length}권을 대상 학년과 주제로 찾아볼 수 있는 서가`;
  fs.writeFileSync(path.join(out, 'index.html'), noPh(html
    .replace('{{BASE}}', '<base href="./">') // 기준 주소를 처음에 고정한다. 서가 안에서 책 주소로 옮겨 가도 표지·글꼴 경로가 서가 뿌리 기준으로 남는다
    .replace('{{OG}}', () => ogTags({ type: 'website', title: `${site.role ? site.role + ' ' : ''}${site.author} · ${site.brandSub || '작품 서가'}`, desc: `신간 『${newest.title}』 · ${siteDesc}`, pagePath: '', img: 'site.jpg' }))));
  const noOg = [];
  for (const b of list) {
    const k = keyOf(b), d = path.join(out, k);
    if (!hasOg(k + '.jpg')) noOg.push(b.title);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), noPh(html
      // 끝 '/' 없이 들어오면(서버에 따라) 그림 경로가 어긋나므로 '/'를 붙여 다시 연다
      .replace('{{BASE}}', () => `<script>if(!location.pathname.endsWith('/'))location.replace(location.pathname+'/'+location.search+location.hash)</script>\n<base href="../">`)
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(b.title)} · ${esc(site.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(b.one)}">`)
      .replace('{{OG}}', () => ogTags({ type: 'book', title: `${b.title} · ${site.author}`, desc: b.one, pagePath: k + '/', img: k + '.jpg' }))));
  }
  if (!URL0) console.warn(`[${site.slug}] 배포 주소(sites/${site.slug}.json의 "url")가 없어 미리보기 그림 태그를 넣지 않았습니다. 카카오톡 미리보기에 그림이 뜨지 않습니다.`);
  if (noOg.length) console.warn(`[${site.slug}] 미리보기 그림이 없는 책 ${noOg.length}권: ${noOg.slice(0, 5).join(', ')}${noOg.length > 5 ? ' …' : ''} → npm run og`);
  await serifSubset(html.replace(/<[^>]+>/g, ''), path.join(out, 'assets', 'fonts'));
  fs.writeFileSync(path.join(out, 'assets', 'style.css'), css);
  fs.writeFileSync(path.join(out, 'assets', 'app.js'), app);
  built.push(site);
  console.log(`[${site.slug}] ${list.length}권 → dist/${site.slug}/` + (small ? `  (세로 700px 미만 표지 ${small}장: 큰 표지로 바꾸면 상세 화면이 선명해집니다)` : ''));
}
if (!only) {
  const links = built.map(s => `<li><a href="${esc(s.slug)}/">${esc(s.title)}</a></li>`).join('');
  fs.writeFileSync(P('dist', 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>작품 서가</title>` +
    (built.length === 1 ? `<meta http-equiv="refresh" content="0; url=${esc(built[0].slug)}/">` : '') +
    `<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px}a{color:#1F3FB0}</style><h1>작품 서가</h1><ul>${links}</ul>`);
  fs.writeFileSync(P('dist', '.nojekyll'), '');
}
