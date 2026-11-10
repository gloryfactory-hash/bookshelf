/* 작품 서가: 진열대(3D 곡면 서가) + 서고(필터 격자) + 상세 페이지.
   데이터는 index.html 안의 #books-data, #site-data에서 읽는다. build.js가 채워 넣는다. */
(() => {
"use strict";
const ALL = JSON.parse(document.getElementById('books-data').textContent);
const SITE = JSON.parse(document.getElementById('site-data').textContent);
const BYID = new Map(ALL.map(b => [b.id, b]));
/* 책 주소 (2026-11-08, 시안/address_v1 가안): 서가 뿌리 + ISBN + '/' (ISBN이 없으면 ID).
   책마다 build가 만든 진짜 페이지가 있고, 서가 안에서 책을 열면 history로 주소창만 바꾼다.
   페이지마다 <base>가 있어 서가 뿌리를 document.baseURI로 안다. 파일로 직접 열었을 때(file://)는 주소를 바꿀 수 없어 예전처럼 '#' 주소를 쓴다. */
const BYKEY = new Map(ALL.map(b => [b.isbn || b.id, b]));
const ROOT = new URL('./', document.baseURI).pathname;
const BYPATH = location.protocol !== 'file:';
const SITE_TITLE = document.querySelector('meta[property="og:site_name"]')?.content || document.title;
/* 학년·주제 페이지 (2026-11-08): 'g-중학년' → <서가>/3-4학년/, 'k-가족' → <서가>/주제/가족/. build.js가 정한 목록(SITE.pages)만.
   화면은 그 조건으로 연 '전체 작품'. 서고에서 조건이 학년 하나나 주제 하나만 남으면 주소도 그 페이지로 바꾼다. */
const PAGE = new Map((SITE.pages || []).map(p => [p.k, p]));
const PAGEP = new Map((SITE.pages || []).map(p => [p.p, p.k]));
function curRoute() {
  if (BYPATH && location.pathname.startsWith(ROOT)) {
    let rest = location.pathname.slice(ROOT.length).replace(/index\.html$/, '').replace(/\/$/, '');
    try { rest = decodeURIComponent(rest); } catch (e) { /* 그대로 */ }
    const b = BYKEY.get(rest) || BYID.get(rest);
    if (b) return 'b-' + b.id;
    if (PAGEP.has(rest)) return PAGEP.get(rest);
  }
  const h = location.hash.slice(1), b = BYKEY.get(h);
  return b ? 'b-' + b.id : h;
}
function urlFor(h) {
  if (h.startsWith('b-') && BYID.has(h.slice(2))) { const b = BYID.get(h.slice(2)); return ROOT + (b.isbn || b.id) + '/'; }
  if (PAGE.has(h)) return ROOT + encodeURI(PAGE.get(h).p) + '/';
  return ROOT + (h && h !== 'shelf' ? '#' + h : '');
}
const TGT = SITE.targets.map(t => [t.name, t.label]);
// 주제는 책이 많은 주제부터 (2026-11-08). 같은 수면 vocab.json 순서.
const KW = SITE.keywords.map((k, i) => [k, i, ALL.filter(b => b.kw.includes(k)).length]).sort((a, b) => b[2] - a[2] || a[1] - b[1]).map(x => x[0]);
const NEWEST = Math.max(...ALL.map(b => b.y));
// 진열대 순서: 최근 책(최신순)을 앞에, 그 뒤에 나머지 대표작(최신순). 첫 화면 가운데는 가장 최근 책.
// recentCount가 있으면 최근 n권, 없으면 최근 recentYears년.
const newestFirst = (a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko');
const RECENT = SITE.recentCount ? ALL.slice().sort(newestFirst).slice(0, SITE.recentCount)
  : ALL.filter(b => b.y > NEWEST - (SITE.recentYears || 2)).sort(newestFirst);
let BOOKS = [...RECENT, ...ALL.filter(b => b.feat && !RECENT.includes(b)).sort(newestFirst)];
if (BOOKS.length < 8) BOOKS = ALL.slice().sort(newestFirst); // 책이 적은 서가는 진열대에 전부 꽂는다
// 첫 화면 가운데 책: 대표 책(SITE.lead, sites/*.json leadBook)이 있으면 그 책, 없으면 가장 최근 책 (2026-11-08)
if (SITE.lead && BYID.has(SITE.lead) && !BOOKS.some(b => b.id === SITE.lead)) BOOKS.unshift(BYID.get(SITE.lead));
const N = BOOKS.length, COPIES = Math.max(2, Math.ceil(30 / N)), TOT = N * COPIES, P = 1400;
const START = SITE.lead ? Math.max(0, BOOKS.findIndex(b => b.id === SITE.lead)) : 0;
const $ = id => document.getElementById(id);
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => x * x * (3 - 2 * x);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const stage = $('stage'), shelf = $('shelf'), probe = $('probe');
const detail = $('detail'), lib = $('lib'), dot = $('dot'), tl = $('tl');
$('navN').textContent = ALL.length; $('libN').textContent = ALL.length + '권';

/* ---------- tapes ---------- */
const tapes = [];
for (let v = 0; v < TOT; v++) {
  const b = BOOKS[v % N];
  const e = el('div', 'tape');
  const sp = el('div', 'face sp'); sp.style.backgroundColor = b.col; sp.style.color = b.ink;
  const band = el('i', 'band'); band.style.backgroundImage = 'url(' + b.thumb + ')';
  sp.append(band, el('b', 'st', b.title), el('em', 'sa', SITE.spineName), el('small', 'spub', b.pub.replace(/\(.*\)/, '')));
  const cv = el('div', 'face cv'); cv.style.backgroundImage = 'url(' + b.img + ')';
  // 반대쪽 면(2026-11-08 사용자 "표지로 채워 봐"): 오른쪽 책은 앞표지가 뒤를 향해 책등만 보였다.
  // 같은 앞표지를 반대쪽에도 붙여, 책들이 가운데 책을 향해 양쪽으로 펼쳐 놓인 것처럼 보이게 한다.
  const cb = el('div', 'face cv cb'); cb.style.backgroundImage = 'url(' + b.img + ')';
  e.append(sp, cv, cb); stage.append(e);
  tapes.push({ v, b, el: e, sp, cv, cb, lift: 0, hidden: false, o: 0, z: -1e9 });
}

let H, W, ws, gap, U, XS = [], mobile, shelfC;
function measure() {
  H = probe.getBoundingClientRect().height; W = innerWidth; mobile = W < 768;
  ws = H * .11; gap = H * .03; U = H * (mobile ? 1.05 : 1.3);
  XS = []; let acc = 0;
  for (let u = 0; u <= 3 * U + 4; u += 2) { XS.push(acc); acc += 2 / (1 + Math.pow(u / U, 1.6)); }
  const r = shelf.getBoundingClientRect(); shelfC = r.top + r.height / 2;
  for (const b of BOOKS) { if (b.a <= .95) { b.bw = H * b.a; b.bh = H; } else { b.bw = H * .95; b.bh = H * .95 / b.a; } }
  for (const t of tapes) {
    const b = t.b, top = H / 2 - b.bh;
    Object.assign(t.sp.style, { width: ws + 'px', height: b.bh + 'px', left: -ws / 2 + 'px', top: top + 'px', transform: 'translateZ(' + b.bw / 2 + 'px)' });
    Object.assign(t.cv.style, { width: b.bw + 'px', height: b.bh + 'px', left: -b.bw / 2 + 'px', top: top + 'px', transform: 'rotateY(90deg) translateZ(' + ws / 2 + 'px)' });
    Object.assign(t.cb.style, { width: b.bw + 'px', height: b.bh + 'px', left: -b.bw / 2 + 'px', top: top + 'px', transform: 'rotateY(-90deg) translateZ(' + ws / 2 + 'px)' });
    const bandH = b.bh * .17;
    t.sp.querySelector('.band').style.height = bandH + 'px';
    const fs = Math.min(ws * .42, (b.bh - bandH - ws * 2.2) / ([...b.title].length * 1.08));
    t.sp.querySelector('.st').style.fontSize = fs + 'px';
    const small = Math.max(6, ws * .18);
    t.sp.querySelector('.sa').style.fontSize = small + 'px';
    t.sp.querySelector('.spub').style.fontSize = small * .92 + 'px';
  }
}
const scl = u => 1 / (1 + Math.pow(Math.abs(u) / U, 1.6));
function xsc(u) { const a = Math.abs(u) / 2, i = Math.min(XS.length - 2, Math.floor(a)), f = a - i; return Math.sign(u) * (XS[i] + (XS[i + 1] - XS[i]) * f); }
const Bf = r => Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * .5;
function rel(v, s) { let d = mod(v - s, TOT); if (d >= TOT / 2) d -= TOT; return d; }
/* 트랙 위 책 자리 (2026-11-09, 트랙 끌기): 같은 해 진열대 책은 그 해 칸 안에 고르게 나눠 앉힌다(진열대 앞쪽 책이 오른쪽).
   예전에는 모두 그 해 한가운데(y + .5)라, 끌 때 손가락과 작가 자리가 어긋났다. */
const TPOS = new Map();
(() => {
  const byY = {};
  for (const b of BOOKS) (byY[b.y] = byY[b.y] || []).push(b);
  for (const y in byY) { const a = byY[y], k = a.length; a.forEach((b, j) => TPOS.set(b, +y + (k - j - .5) / k)); }
})();
const tOf = b => TPOS.get(b);

/* ---------- timeline ---------- */
const Y0 = Math.min(...BOOKS.map(b => b.y)), Y1 = NEWEST + 1;
(function () {
  const span = Y1 - Y0;
  for (let y = Y0; y <= Y1; y++) {
    for (let q = 0; q < 4; q++) {
      const t = y + q / 4; if (t > Y1) break;
      const d = el('div', 'tk ' + (q ? 'min' : 'maj')); d.style.left = ((t - Y0) / span * 100) + '%'; tl.insertBefore(d, dot);
    }
    if (y < Y1) { const l = el('div', 'yr' + (y === Y0 ? ' first' : '') + ((y - Y0) % 2 ? ' odd' : ''), y); l.style.left = ((y - Y0) / span * 100) + '%'; tl.insertBefore(l, dot); }
  }
  const seen = {};
  for (const b of BOOKS) { const k = b.y; seen[k] = (seen[k] || 0) + 1; const p = el('div', 'pip'); p.style.left = ((b.y + .2 + (seen[k] - 1) * .15 - Y0) / span * 100) + '%'; tl.insertBefore(p, dot); }
})();

/* ---------- caption ---------- */
const capEls = { title: $('mTitle'), sub: $('mSub'), year: $('mYear') };
function setCaption(i, dir) {
  const b = BOOKS[i];
  const tx = { title: ['ctitle', b.title], sub: ['csub', b.one], year: ['cyear', b.y + ' — ' + b.tgt] };
  for (const k in capEls) {
    const m = capEls[k], n = el('span', tx[k][0], tx[k][1]), olds = [...m.children];
    m.append(n);
    if (RM.matches || !dir) { olds.forEach(o => o.remove()); continue; }
    n.animate([{ transform: `translateY(${dir * 105}%)` }, { transform: 'translateY(0)' }], { duration: 650, easing: EASE, fill: 'both' });
    for (const o of olds) {
      const cs = getComputedStyle(o).transform; o.getAnimations().forEach(a => a.cancel());
      o.animate([{ transform: cs === 'none' ? 'translateY(0)' : cs }, { transform: `translateY(${-dir * 105}%)` }], { duration: 650, easing: EASE, fill: 'both' }).onfinish = () => o.remove();
    }
  }
}

/* ---------- state ---------- */
let s = START + N, T = s, last = performance.now();
let active = -1, dragging = false, hovered = null, scrub = null;
let mx = innerWidth / 2, my = innerHeight / 2;
let tiltX = 0, tiltY = 0, dotY = tOf(BOOKS[START]);
/* 트랙 위 작가 (2026-11-08, 시안/track_v1 나). SITE.runner인 서가만. 움직이면 달리기(땀방울), 멈춘 뒤 손 흔들기, 그다음 서기.
   서 있으면 5초쯤 뒤 스트레칭(만세 / 다리 잡기 번갈아), 그다음 7~12초 뒤 화면 보고 하트 … 한 번 들어와서 여섯 번까지(하트는 세 번). 옛날 책 쪽으로 가면 몸을 돌린다. */
const RUN = !!SITE.runner;
let rnPrev = dotY, rnLast = performance.now() - 150, rnDir = 1, rnSt = '', rnD0 = 0, rnAct = '', rnNext = 0, rnEnd = 0, rnCnt = 0;
if (RUN) dot.append(el('i', 'sw'), el('i', 'rn'), el('i', 'ht'));
function runner(now) {
  const v = dotY - rnPrev; rnPrev = dotY;
  if (Math.abs(v) > 2e-3) { if (Math.abs(v) < 3) rnDir = v > 0 ? 1 : -1; rnLast = now; }
  let st = now - rnLast < 140 ? 'run' : now - rnLast < 1500 ? 'wave' : 'stand';
  if (st !== 'stand' || RM.matches) { rnAct = ''; rnNext = 0; }
  else if (rnAct && now < rnEnd) st = rnAct;
  else if (rnAct) { rnAct = ''; rnNext = now + 7000 + Math.random() * 5000; }
  else if (!rnNext) rnNext = now + 4500 + Math.random() * 2000;
  else if (now > rnNext && rnCnt < 6) { rnAct = rnCnt % 2 ? 'heart' : (rnCnt % 4 ? 'strB' : 'strA'); rnEnd = now + (rnAct === 'heart' ? 2000 : 1800); rnCnt++; st = rnAct; }
  if (st !== rnSt || rnDir !== rnD0) { rnSt = st; rnD0 = rnDir; dot.className = 'dot ' + st + (rnDir < 0 ? ' l' : ''); }
}
let view = 'shelf', openId = null, inkT0 = 0, inkFast = false;
const overlay = () => view !== 'shelf' || openId !== null;
const activeTape = () => tapes[mod(Math.round(s), TOT)];
function dOpenNow() { const i0 = Math.floor(s), f = s - i0, a = BOOKS[mod(i0, N)].bw, b = BOOKS[mod(i0 + 1, N)].bw; return a + (b - a) * f; }

let ptrDirty = false, ptrCur = '';
function pick(x, y) {
  if (overlay()) return null;
  let best = null, bz = -1e9;
  for (const t of tapes) {
    if (t.hidden || t.z <= bz) continue;
    const r = (t.o > .5 ? t.cv : t.sp).getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { bz = t.z; best = t; }
  }
  return best;
}

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const shelfLive = view === 'shelf' && openId === null;
  if (shelfLive || Math.abs(T - s) > 1e-4) {
    s += (T - s) * (RM.matches ? 1 : (1 - Math.exp(-(dragging ? 18 : 5.2) * dt)));
    if (Math.abs(T - s) < 1e-4) s = T;
    if (Math.abs(s) > N * 40) { const sh = Math.round(s / N) * N - N; s -= sh; T -= sh; if (scrub) scrub.lap -= sh; }
    const ai = mod(Math.round(s), N);
    // 트랙을 끄는 동안은 표지 아래 글자가 위아래로 움직이지 않고 바로 바뀐다(빨리 끌 때 번쩍이지 않게)
    if (ai !== active) { const dir = active < 0 || scrub ? 0 : (Math.sign(T - s) || 1); active = ai; setCaption(ai, dir); }
    const dOpen = dOpenNow();
    const onCover = shelfLive && Math.abs(T - s) < .3 && Math.abs(mx - W / 2) < .55 * dOpen && Math.abs(my - shelfC) < .55 * H;
    const ta = 1 - Math.exp(-7 * dt);
    if (onCover) { tiltY += ((mx - W / 2) / (.55 * dOpen) * 8 - tiltY) * ta; tiltX += (-(my - shelfC) / (H / 2) * 5 - tiltX) * ta; }
    else { tiltY += ((mx - W / 2) / W * 4 - tiltY) * ta; tiltX += (0 - tiltX) * ta; }
    if (ptrDirty) { ptrDirty = false; hovered = (Math.abs(my - shelfC) < H * .75) ? pick(mx, my) : null; }
    const la = RM.matches ? 1 : 1 - Math.exp(-12 * dt);
    for (const t of tapes) {
      const r = rel(t.v, s);
      const u = r * (ws + gap) + (dOpen - ws + 1.4 * gap) * Bf(r);
      if (Math.abs(u) > U * 1.6) { if (!t.hidden) { t.el.style.visibility = 'hidden'; t.hidden = true; } continue; }
      if (t.hidden) { t.el.style.visibility = ''; t.hidden = false; }
      const o = smooth(Math.max(0, 1 - Math.abs(r)));
      t.lift += (((hovered === t && Math.abs(r) > .5) ? 1 : 0) - t.lift) * la;
      const sc = scl(u), kk = 1 / sc;
      const z = P * (1 - kk) + o * H * .1, x = xsc(u) * kk;
      const y = (H * .5 * (1 - sc) * .42 + o * H * .012 - t.lift * H * .05) * kk;
      const ry = Math.sign(u) * Math.min(1, Math.abs(u) / U) * 26 * (1 - o) - 90 * o + tiltY * o;
      t.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateX(${(tiltX * o).toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
      t.el.style.zIndex = Math.round(10000 + z); t.o = o; t.z = z;
      t.sp.style.setProperty('--shade', Math.min(.6, o * .55 + (1 - sc) * .32).toFixed(3));
      t.cv.style.setProperty('--shade', ((1 - o) * .5).toFixed(3));
      t.cb.style.setProperty('--shade', ((1 - o) * .5).toFixed(3));
    }
    const i0 = Math.floor(s), f = s - i0, ya = tOf(BOOKS[mod(i0, N)]), yb = tOf(BOOKS[mod(i0 + 1, N)]);
    const yy = yb < ya ? (f < .5 ? ya : yb) : ya + (yb - ya) * f;
    // 트랙을 끄는 동안 작가는 손가락 자리로 달려간다
    if (scrub) dotY = RM.matches ? scrub.t : dotY + (scrub.t - dotY) * (1 - Math.exp(-20 * dt));
    else if (Math.abs(yy - dotY) > 6 || RM.matches) dotY = yy; else dotY += (yy - dotY) * (1 - Math.exp(-14 * dt));
    dot.style.left = ((dotY - Y0) / (Y1 - Y0) * 100) + '%';
    if (RUN) runner(now);
    // 따라다니는 원 대신 기본 화살표. 책 위에서는 손가락 모양(누를 수 있다는 표시)
    const want = dragging ? 'grabbing' : (onCover || hovered) ? 'pointer' : '';
    if (want !== ptrCur) { ptrCur = want; shelf.style.cursor = want; }
  }
  if (openId !== null) drawInk(now);
  requestAnimationFrame(frame);
}

/* ---------- shelf input ---------- */
addEventListener('pointermove', e => {
  mx = e.clientX; my = e.clientY; ptrDirty = true;
}, { passive: true });
let down = null;
shelf.addEventListener('pointerdown', e => { if (overlay() || e.button > 0) return; down = { x: e.clientX, y: e.clientY, T0: T, moved: false, id: e.pointerId }; });
addEventListener('pointermove', e => {
  if (!down || e.pointerId !== down.id) return;
  const dx = e.clientX - down.x;
  if (!down.moved && Math.abs(dx) > 5) { down.moved = true; dragging = true; try { shelf.setPointerCapture(e.pointerId); } catch (_) {} }
  if (down.moved) T = down.T0 - dx / (ws + gap);
});
addEventListener('pointerup', e => {
  if (!down || e.pointerId !== down.id) return;
  const d = down; down = null;
  if (d.moved) { dragging = false; T = Math.round(T); return; }
  const tp = pick(d.x, d.y); if (!tp) return;
  if (Math.abs(rel(tp.v, s)) < .5 && Math.abs(T - s) < .3) openShelfBook(); else T = Math.round(T + rel(tp.v, T));
});
addEventListener('pointercancel', () => { if (down) { dragging = false; T = Math.round(T); down = null; } });
let wheelTO;
addEventListener('wheel', e => {
  if (overlay()) return;
  e.preventDefault();
  T += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / (ws + gap) * .5;
  clearTimeout(wheelTO); wheelTO = setTimeout(() => { T = Math.round(T); }, 160);
}, { passive: false });
$('prev').addEventListener('click', () => { T = Math.round(T) - 1; });
$('next').addEventListener('click', () => { T = Math.round(T) + 1; });
/* 트랙 끌기 (2026-11-09, 사용자 "트랙 전체로 만들어"): 트랙 아무 데나 누르고 끌면 작가가 손가락을 따라 달리고, 책장이 그 자리 책으로 따라온다.
   책 자리 사이에서는 책장이 부드럽게 넘어가고(이웃한 책일 때), 손을 떼면 가장 가까운 책에 멈춘다. 누르기만 하면 예전처럼 그 자리 책으로 간다. */
const TSORT = BOOKS.map((b, i) => [tOf(b), i]).sort((a, b) => a[0] - b[0]);
const TMIN = TSORT[0][0], TMAX = TSORT[TSORT.length - 1][0];
const tlhit = $('tlhit');
function tAt(x) { const r = tl.getBoundingClientRect(); return clamp(Y0 + clamp((x - r.left) / r.width, 0, 1) * (Y1 - Y0), TMIN, TMAX); }
function idxAt(t) {
  if (TSORT.length < 2) return TSORT[0][1];
  let k = 0; while (k < TSORT.length - 2 && TSORT[k + 1][0] <= t) k++;
  const [ta, ia] = TSORT[k], [tb, ib] = TSORT[k + 1], f = tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 0;
  return Math.abs(ia - ib) === 1 ? ia + (ib - ia) * f : (f < .5 ? ia : ib);
}
// 트랙은 곧은 줄이라 책장도 한 바퀴를 넘지 않고 그 책까지 곧장 간다(짧은 쪽으로 돌면 최신 책을 거쳐 가서 작가가 잠깐 반대로 달렸다. 2026-11-09)
function scrubTo(x) { scrub.t = tAt(x); T = scrub.lap + idxAt(scrub.t); }
tlhit.addEventListener('pointerdown', e => {
  if (overlay() || e.button > 0) return;
  e.preventDefault();
  const c = Math.round(s);
  scrub = { id: e.pointerId, t: dotY, lap: c - mod(c, N) }; dragging = true; tl.classList.add('on');
  try { tlhit.setPointerCapture(e.pointerId); } catch (_) {}
  scrubTo(e.clientX);
});
tlhit.addEventListener('pointermove', e => { if (scrub && e.pointerId === scrub.id) scrubTo(e.clientX); });
function scrubEnd(e) { if (!scrub || e.pointerId !== scrub.id) return; scrub = null; dragging = false; tl.classList.remove('on'); T = Math.round(T); }
tlhit.addEventListener('pointerup', scrubEnd);
tlhit.addEventListener('pointercancel', scrubEnd);
tlhit.addEventListener('lostpointercapture', scrubEnd);
function openShelfBook() { T = Math.round(T); go('b-' + BOOKS[mod(T, N)].id); }
// 표지 아래 제목을 누르면 책 소개 (2026-11-08, '+' 동그라미 대신). 마우스를 올리면 주황 밑줄
$('mTitle').addEventListener('click', () => { if (!overlay()) openShelfBook(); });
$('mTitle').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!overlay()) openShelfBook(); } });

/* ---------- library ---------- */
const F = { tgt: null, kw: null, series: null, q: '', sort: 'new' };
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho = str => [...str].map(c => { const k = c.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');
for (const b of ALL) { b._t = b.title.replace(/\s/g, '').toLowerCase(); b._c = cho(b._t); }
function matchQ(b, q) {
  if (!q) return true;
  const qq = q.replace(/\s/g, '').toLowerCase();
  if (/^[ㄱ-ㅎ]+$/.test(qq)) return b._c.includes(qq);
  return b._t.includes(qq) || b._c.includes(cho(qq));
}
const pass = (b, skip) => (skip === 'tgt' || !F.tgt || b.tgt === F.tgt) && (skip === 'kw' || !F.kw || b.kw.includes(F.kw)) && (!F.series || b.series === F.series) && matchQ(b, F.q);
const seg = $('seg'), chips = $('chips'), grid = $('grid'), activeBar = $('active');
const segBtns = [['전체', null, '']].concat(TGT.map(([t, a]) => [t, t, a])).map(([label, val, age]) => {
  const bt = el('button'); bt.dataset.v = val || '';
  bt.append(document.createTextNode(label), el('span', 'n')); if (age) bt.append(el('span', 'ag', age));
  bt.addEventListener('click', () => { F.tgt = val; renderLib(); }); seg.append(bt); return bt;
});
const chipBtns = KW.map(k => {
  const bt = el('button', 'chip'); bt.append(document.createTextNode(k), el('span', 'n'));
  bt.addEventListener('click', () => { F.kw = F.kw === k ? null : k; renderLib(); }); chips.append(bt); return [k, bt];
});
// 주제는 휴대폰 두 줄, 컴퓨터 한 줄만 보이고 '주제 모두 보기'로 펼친다. 고른 주제는 늘 보인다.
// (컴퓨터는 2026-11-10 레퍼런스 보고서 반영: 학년 페이지에서 거르기 줄이 3단이라 책이 화면 아래로 밀렸다)
const more = el('button', 'more'); more.type = 'button';
more.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0v10M0 5h10" stroke="currentColor" stroke-width="1.4"/></svg><span></span>';
chips.append(more);
const MOB = matchMedia('(max-width:767px)');
let chipsOpen = false;
function foldChips() {
  const list = chipBtns.map(x => x[1]);
  list.forEach(c => c.classList.remove('fold'));
  if (lib.hidden) return;
  more.hidden = false;
  const shown = list.filter(c => getComputedStyle(c).display !== 'none');
  if (!shown.length) { more.hidden = true; return; }
  more.setAttribute('aria-expanded', String(chipsOpen));
  more.lastChild.textContent = chipsOpen ? '접기' : '주제 모두 보기 ' + shown.length;
  if (chipsOpen) return;
  const limit = shown[0].offsetTop + shown[0].offsetHeight * (MOB.matches ? 1.5 : .5) + 8; // 휴대폰 두 번째 줄, 컴퓨터 첫 줄까지
  let folded = 0;
  for (let i = shown.length - 1; i >= 0 && more.offsetTop > limit; i--) {
    if (shown[i].getAttribute('aria-pressed') !== 'true') { shown[i].classList.add('fold'); folded++; }
  }
  if (!folded) more.hidden = true;
}
more.addEventListener('click', () => { chipsOpen = !chipsOpen; foldChips(); });
addEventListener('resize', foldChips);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(foldChips); // 글꼴이 늦게 오면 칩 너비가 바뀐다
$('q').addEventListener('input', e => { F.q = e.target.value.trim(); renderLib(); });
$('sort').addEventListener('change', e => { F.sort = e.target.value; renderLib(); });
function sorter(a, b) {
  if (F.sort === 'title') return a.title.localeCompare(b.title, 'ko');
  if (F.sort === 'old') return a.y - b.y || a.title.localeCompare(b.title, 'ko');
  return b.y - a.y || a.title.localeCompare(b.title, 'ko');
}
function cardFor(b) {
  const c = el('button', 'card'); c.dataset.id = b.id;
  const cv = el('div', 'cvr'); const im = new Image(); im.src = b.thumb; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; cv.append(im);
  const mt = el('div', 'mt', b.tgt + ' / ' + b.y);
  c.append(cv, el('div', 't', b.title), el('div', 'o', b.one), mt);
  c.setAttribute('aria-label', `${b.title}, ${b.tgt}, ${b.y}년`);
  c.addEventListener('click', () => go('b-' + b.id));
  return c;
}
function seriesCard(name, list) {
  const c = el('button', 'card'); const cv = el('div', 'cvr'); const st = el('div', 'stack');
  const show = list.slice(0, 3);
  show.forEach((b, i) => { const im = new Image(); im.src = b.thumb; im.alt = ''; im.loading = 'lazy'; const off = (i - (show.length - 1) / 2) * 16; im.style.transform = `translateX(calc(-50% + ${off}px)) rotate(${off * .12}deg)`; im.style.zIndex = 3 - i; st.append(im); });
  [...st.children].reverse().forEach(n => st.append(n));
  cv.append(st);
  const ys = list.map(b => b.y), yr = Math.min(...ys) === Math.max(...ys) ? Math.min(...ys) : Math.min(...ys) + '–' + Math.max(...ys);
  const mt = el('div', 'mt'); mt.append(el('span', 's', '시리즈 ' + list.length + '권'), document.createTextNode(' / ' + yr));
  c.append(cv, el('div', 't', name), el('div', 'o', list.map(b => b.title).join(', ')), mt);
  c.setAttribute('aria-label', `${name} 시리즈 ${list.length}권 모아 보기`);
  c.addEventListener('click', () => { F.series = name; renderLib(); lib.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); });
  return c;
}
function renderLib() {
  const base = ALL.filter(b => pass(b, 'tgt'));
  segBtns.forEach(bt => {
    const v = bt.dataset.v || null, n = v ? base.filter(b => b.tgt === v).length : base.length;
    bt.querySelector('.n').textContent = n; bt.setAttribute('aria-pressed', String(F.tgt === v)); bt.disabled = !n && F.tgt !== v;
  });
  const kbase = ALL.filter(b => pass(b, 'kw'));
  chipBtns.forEach(([k, bt]) => { const n = kbase.filter(b => b.kw.includes(k)).length; bt.querySelector('.n').textContent = n; bt.setAttribute('aria-pressed', String(F.kw === k)); bt.disabled = !n && F.kw !== k; });
  const list = ALL.filter(b => pass(b)).sort(sorter);
  const lk = landKey(), pg = lk && PAGE.get(lk);
  $('libH').textContent = pg ? pg.h : '전체 작품';
  $('libN').textContent = (pg ? list.length : ALL.length) + '권';
  $('libIntro').hidden = !pg; $('libIntro').textContent = pg ? pg.t : '';
  renderSub(pg);
  if (view === 'lib' && openId === null) {
    document.title = pg ? `${pg.h} · ${SITE_TITLE}` : SITE_TITLE;
    if (BYPATH) { const u = urlFor(lk || 'books'); if (location.pathname + location.hash !== u) history.replaceState(null, '', u); }
  }
  activeBar.textContent = '';
  const tags = [];
  if (F.series) tags.push(['시리즈: ' + F.series, () => { F.series = null; }]);
  if (F.tgt) tags.push([F.tgt, () => { F.tgt = null; }]);
  if (F.kw) tags.push([F.kw, () => { F.kw = null; }]);
  if (F.q) tags.push(['“' + F.q + '”', () => { F.q = ''; $('q').value = ''; }]);
  document.body.classList.toggle('land', !!pg); // 학년·주제 페이지: 0권 주제 단추는 숨김(style.css .land)
  foldChips(); // .land가 정해진 뒤에 접어야 숨은 주제를 세지 않는다
  if (tags.length && !pg) activeBar.append(el('span', null, list.length + '권')); // 학년·주제 페이지는 제목에 권수가 있다 // 조건이 없으면 제목의 '전체 작품 70권'과 겹치니 빼다
  for (const [label, fn] of tags) {
    const t = el('span', 'tag', label), x = el('button'); x.setAttribute('aria-label', label + ' 조건 빼기');
    x.innerHTML = '<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.4"/></svg>';
    x.addEventListener('click', () => { fn(); renderLib(); }); t.append(x); activeBar.append(t);
  }
  if (tags.length > 1) { const r = el('button', 'reset', '조건 모두 지우기'); r.addEventListener('click', resetF); activeBar.append(r); }
  grid.textContent = '';
  if (!list.length) {
    const e = el('div', 'empty', '이 조건에 맞는 책이 없어요.'); const r = el('button', null, '조건 모두 지우기'); r.addEventListener('click', resetF); e.append(r); grid.append(e); return;
  }
  const groups = new Map();
  if (!F.series && !F.q) for (const b of list) if (b.series) { if (!groups.has(b.series)) groups.set(b.series, []); groups.get(b.series).push(b); }
  const done = new Set();
  for (const b of list) {
    const g = b.series && groups.get(b.series);
    if (g && g.length > 1) { if (!done.has(b.series)) { done.add(b.series); grid.append(seriesCard(b.series, g.slice().sort((a, c) => a.y - c.y))); } continue; }
    grid.append(cardFor(b));
  }
}
// 지금 조건이 학년 하나나 주제 하나뿐이고 그 페이지가 있으면 그 페이지 열쇠
function landKey() {
  if (F.series || F.q) return null;
  const k = F.tgt && !F.kw ? 'g-' + F.tgt : !F.tgt && F.kw ? 'k-' + F.kw : null;
  return k && PAGE.has(k) ? k : null;
}
// 학년 페이지는 '주제로 나눠 보기', 주제 페이지는 '학년으로 나눠 보기' (build.js landingStatic과 같은 모양)
function renderSub(pg) {
  const sub = $('libSub'); sub.textContent = ''; sub.hidden = !pg || !pg.g.length; if (sub.hidden) return; // 책이 적어 나눌 게 없으면 숨김
  sub.append(el('h2', null, pg.gh));
  for (const [label, key, ids] of pg.g) {
    const row = el('div', 'lrow'), h3 = el('h3'), ul = el('ul');
    if (key) { const a = el('a', null, label); a.href = urlFor(key); a.dataset.go = key; h3.append(a); } else h3.append(label);
    h3.append(el('span', 'n', ids.length + '권'));
    for (const id of ids) { const b = BYID.get(id); if (!b) continue; const li = el('li'), a = el('a', null, b.title); a.href = urlFor('b-' + id); a.dataset.go = 'b-' + id; li.append(a); ul.append(li); }
    row.append(h3, ul); sub.append(row);
  }
}
function resetF() { F.tgt = F.kw = F.series = null; F.q = ''; $('q').value = ''; renderLib(); }
$('libNote').textContent = SITE.note || '';

/* ---------- 첫 화면 학년 줄: 누르면 다른 조건을 지우고 그 학년만 고른 서고를 연다 ---------- */
const SHORT = { 저학년: '1~2학년', 중학년: '3~4학년', 고학년: '5~6학년', 청소년: '중·고등', 일반: '어른' };
for (const t of SITE.targets) {
  const n = ALL.filter(b => b.tgt === t.name).length; if (!n) continue;
  const bt = el('button'); bt.append(el('b', null, SHORT[t.name] || t.name), el('span', 'n', n + '권'));
  bt.setAttribute('aria-label', `${t.label}(${t.name}) 책 ${n}권 보기`);
  bt.addEventListener('click', () => { F.tgt = t.name; F.kw = F.series = null; F.q = ''; $('q').value = ''; go(PAGE.has('g-' + t.name) ? 'g-' + t.name : 'books'); });
  $('grb').append(bt);
}
$('grb').style.setProperty('--gn', $('grb').children.length); // 휴대폰에서 칸을 같은 너비로 나눈다

/* ---------- routing ---------- */
function go(h) {
  if (!BYPATH) { if (location.hash.slice(1) === h) route(); else location.hash = h; return; }
  const u = urlFor(h); if (location.pathname + location.hash !== u) history.pushState(null, '', u); route();
}
let histDepth = 0;
addEventListener(BYPATH ? 'popstate' : 'hashchange', () => route());
// 학년·주제 페이지의 책·나눠 보기 링크(data-go): 진짜 주소가 있는 링크지만 서가 안에서는 go로 연다
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const l = e.target.closest && e.target.closest('a[data-go]'); if (!l) return;
  e.preventDefault(); go(l.dataset.go);
});
// '#'로 시작하는 링크(작가 화면의 책 이름, '강연 문의')도 go로 보낸다. 시리즈 링크처럼 먼저 처리한 것은 건드리지 않는다.
if (BYPATH) document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const l = e.target.closest && e.target.closest('a[href^="#"]'); if (!l) return;
  e.preventDefault(); go(l.getAttribute('href').slice(1));
});
// 서고(lib)와 작가 화면(about)은 진열대 위에 아래에서 올라오는 판이다. 한 번에 하나만 열린다.
const about = $('about');
const PANELS = { lib, about };
// 작가 화면 트랙의 달리는 작가: 화면에 보일 때만 달린다(.go). 작가 화면이 닫혀 있으면 멈춘다 (2026-11-09)
const arun = about && about.querySelector('.arun');
if (arun && arun.querySelector('.arme') && 'IntersectionObserver' in window)
  new IntersectionObserver(es => es.forEach(e => arun.classList.toggle('go', e.isIntersecting)), { root: about }).observe(arun);
// 작가 화면 왼쪽 사진: 읽는 자리에 따라 소개 → 달리기 → 강연 사진으로 바뀐다. 컴퓨터 화면에서만(휴대폰은 꼭지 안에 사진을 둔다) (2026-11-09)
const aframe = about && about.querySelector('.aframe');
let aboutPhotoReset = null; // 작가 화면을 새로 열 때 움직임 없이 첫 사진으로 되돌린다
if (aframe && aframe.children.length > 1) {
  const imgs = [...aframe.querySelectorAll('img')], cap = aframe.parentNode.querySelector('figcaption');
  const marks = { run: about.querySelector('.arun'), talk: about.querySelector('#talk') };
  const WIDE = matchMedia('(min-width:768px)');
  let cur = 0, raf = 0;
  const setPhoto = (i, still) => {
    if (i === cur) return;
    const prev = imgs[cur], next = imgs[i], down = i < cur;
    imgs.forEach(m => m.classList.remove('prev'));
    prev.classList.remove('on'); prev.classList.add('prev');
    if (still) { // 움직임 없이 바로 바꾼다
      next.style.transition = 'none'; next.classList.add('on'); void next.offsetWidth; next.style.transition = '';
    } else { // 앞으로 읽으면 아래에서, 거꾸로 읽으면 위에서부터 덮는다(움직임 줄이기 설정이면 CSS가 바로 바꾼다)
      next.style.transition = 'none'; next.style.clipPath = down ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)';
      void next.offsetWidth; next.style.transition = ''; next.style.clipPath = '';
      next.classList.add('on');
    }
    cur = i;
    if (cap) cap.textContent = next.alt;
  };
  const pick = () => {
    raf = 0;
    if (!WIDE.matches) return setPhoto(0);
    const line = innerHeight * .45;
    let i = 0;
    imgs.forEach((m, k) => { const el = marks[m.dataset.at]; if (el && el.getBoundingClientRect().top < line) i = k; });
    setPhoto(i);
  };
  const warm = () => WIDE.matches && imgs.forEach(m => { if (m.loading === 'lazy') m.loading = 'eager'; }); // 덮일 사진을 미리 불러 둔다(가려진 사진은 lazy로는 안 불러옴)
  const ask = () => { warm(); if (!raf) raf = requestAnimationFrame(pick); };
  about.addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  aboutPhotoReset = () => { setPhoto(0, true); imgs.forEach(m => m.classList.remove('prev')); ask(); };
}
// 서고·작가 화면이 덮고 있을 때는 뒤의 진열대로 Tab이 가지 않게 한다.
const BEHIND = ['shelf', 'prev', 'next', 'cap', 'gr'].map($).concat([...document.querySelectorAll('.foot')]);
function showPanel(name, anchor) {
  BEHIND.forEach(n => n && (n.inert = name !== 'shelf'));
  $('navShelf').setAttribute('aria-pressed', String(name === 'shelf')); $('navLib').setAttribute('aria-pressed', String(name === 'lib'));
  if ($('navAbout')) $('navAbout').setAttribute('aria-pressed', String(name === 'about'));
  for (const [k, p] of Object.entries(PANELS)) {
    if (!p) continue;
    const on = k === name, was = !p.hidden;
    if (on && k === 'lib') renderLib();
    if (on && was) { if (anchor) jump(p, anchor); continue; }
    if (on) {
      p.hidden = false; p.scrollTop = 0; p.style.zIndex = 52; if (k === 'lib') foldChips(); if (k === 'about' && aboutPhotoReset) aboutPhotoReset();
      p.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: RM.matches ? 1 : 700, easing: 'cubic-bezier(.76,0,.18,1)' });
      if (anchor) jump(p, anchor, true);
    } else if (was) {
      p.style.zIndex = 51;
      p.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }], { duration: RM.matches ? 1 : 550, easing: 'cubic-bezier(.76,0,.18,1)' }).onfinish = () => { if (view !== k) p.hidden = true; };
    }
  }
}
function jump(p, id, late) {
  const t = $(id); if (!t) return;
  const go2 = () => p.scrollTo({ top: t.offsetTop - 90, behavior: late || RM.matches ? 'auto' : 'smooth' });
  late ? requestAnimationFrame(go2) : go2();
}
const ABOUT_HASH = ['about', 'talk', 'contact'];
const back = () => view === 'lib' ? 'books' : view === 'about' ? 'about' : 'shelf';
/* 닫기 (2026-11-08): 이름과 뜻(서가로 돌아가기)은 그대로. 카톡 링크처럼 책 주소로 바로 들어와 아직 서가를 본 적이 없으면
   이름을 '전체 작품 보기'로 바꾸고 전체 작품(서고)을 연다. ← 화살표는 쓰지 않는다. */
let seenHome = false;
const closeTo = () => seenHome ? back() : 'books';
const closeLabel = () => seenHome ? '닫기' : '전체 작품 보기';
function route() {
  const h = curRoute();
  const ob = h.startsWith('b-') && BYID.get(h.slice(2));
  document.title = ob ? `${ob.title} · ${SITE_TITLE}` : SITE_TITLE;
  if (BYPATH && ob && location.hash.startsWith('#')) history.replaceState(null, '', urlFor(h)); // 예전 '#b-…' 주소는 책 주소로 바꿔 준다
  if (h.startsWith('b-') && BYID.has(h.slice(2))) { openDetail(BYID.get(h.slice(2))); return; }
  if (openId !== null) closeDetail();
  seenHome = true;
  if (PAGE.has(h)) { F.tgt = h[0] === 'g' ? h.slice(2) : null; F.kw = h[0] === 'k' ? h.slice(2) : null; F.series = null; F.q = ''; $('q').value = ''; }
  view = h === 'books' || PAGE.has(h) ? 'lib' : (about && ABOUT_HASH.includes(h)) ? 'about' : 'shelf';
  showPanel(view, view === 'about' && h !== 'about' ? h : null);
  if (view === 'shelf' && booted) shelf.focus({ preventScroll: true });
}
let booted = false;
$('navShelf').addEventListener('click', () => go('shelf'));
$('navLib').addEventListener('click', () => go('books'));
if ($('navAbout')) $('navAbout').addEventListener('click', () => go('about'));
// 작가 화면의 '연계 도서'에서 시리즈를 누르면 서고를 그 시리즈로 걸러 연다.
if (about) about.addEventListener('click', e => {
  const a = e.target.closest('a[data-series]'); if (!a) return;
  e.preventDefault(); F.tgt = F.kw = null; F.q = ''; $('q').value = ''; F.series = a.dataset.series; go('books');
});

/* ---------- detail ---------- */
const circles = [[150,330,0],[340,600,120],[250,120,220],[90,760,300],[400,250,360],[260,860,420],[230,470,180]];
const blots = $('blots'), pimg = $('pimg'), poster = $('poster'), pcr = $('pcr');
const circEls = circles.map(() => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); blots.append(c); return c; });
function drawInk(now) {
  const base = now - inkT0, st = inkFast ? 120 : 520, du = inkFast ? 700 : 1250;
  circles.forEach(([, , d], i) => { const p = clamp((base - st - d * (inkFast ? .5 : 1)) / du, 0, 1); circEls[i].setAttribute('r', (720 * (1 - Math.pow(1 - p, 3))).toFixed(1)); });
}
function originRect(b) {
  if (view === 'lib') {
    const c = grid.querySelector(`.card[data-id="${b.id}"] img`) || [...grid.querySelectorAll('.card')].find(x => x.dataset.id === b.id);
    if (c) { const r = c.getBoundingClientRect(); if (r.width && r.bottom > 0 && r.top < innerHeight) return r; }
  } else if (view === 'shelf') {
    const t = activeTape(); if (t.b.id === b.id) return t.cv.getBoundingClientRect();
  }
  const w = Math.min(240, innerWidth * .4), hh = w / b.a;
  return { left: (innerWidth - w) / 2, top: (innerHeight - hh) / 2, right: (innerWidth + w) / 2, bottom: (innerHeight + hh) / 2 };
}
const insetFrom = r => `inset(${r.top.toFixed(1)}px ${(innerWidth - r.right).toFixed(1)}px ${(innerHeight - r.bottom).toFixed(1)}px ${r.left.toFixed(1)}px round 3px)`;
let opens = 0, lastFocus = null, closeRect = null;
function fillDetail(b) {
  $('dSub').textContent = b.tgt + ' / ' + b.cat + (b.series ? ' / ' + b.series + ' 시리즈' : '');
  $('dTitle').textContent = b.title;
  $('dOne').textContent = b.one;
  const kw = $('dKw'); kw.textContent = '';
  for (const k of b.kw) { const bt = el('button', null, k); bt.addEventListener('click', () => { F.tgt = null; F.kw = k; F.series = null; F.q = ''; $('q').value = ''; go(PAGE.has('k-' + k) ? 'k-' + k : 'books'); }); kw.append(bt); }
  $('dSyn').textContent = b.desc;
  const rec = $('dRec'); rec.textContent = '';
  if (b.rec.length) { const ul = el('ul'); b.rec.forEach(r => ul.append(el('li', null, r))); rec.append(el('h3', null, '추천·선정'), ul); }
  // 도서 정보: 사서·교사가 구입 목록에 옮겨 적는 정보를 구매 단추 위에 모은다 (2026-11-08, 시안 isbn_v1 나)
  const bib = $('dBib'), dl = el('dl'); bib.textContent = '';
  const row = (k, ...v) => { const dd = el('dd'); dd.append(...v); dl.append(el('dt', null, k), dd); };
  const age = (SITE.targets.find(t => t.name === b.tgt) || {}).label;
  row('대상', b.tgt + (age && age !== b.tgt ? ' (' + age + ')' : ''));
  if (b.cat && b.cat !== '일반' && b.cat !== b.tgt) row('분류', b.cat);
  row('출간', b.ed ? `${b.y}년 첫 출간, ${b.ed}년 개정판` : `${b.y}년`);
  if (b.pages) row('쪽수', b.pages + '쪽');
  row('출판사', b.pub);
  if (b.isbn) row('ISBN', el('span', 'isbn', b.isbn), isbnCopyBtn(b.isbn));
  bib.append(el('h3', null, '도서 정보'), dl);
  // 서점 한 줄 (2026-11-08): YES24 | 교보문고 | 알라딘 같은 너비로. 첫째는 채운 단추. 링크가 없는 서점은 빠지고 남은 칸이 너비를 나눈다
  const buy = $('dBuy'), shops = el('div', 'shops'); buy.textContent = '';
  for (const [k, label] of [['yes24', 'YES24'], ['kyobo', '교보문고'], ['aladin', '알라딘']]) {
    const u = b.links[k]; if (!u || !/^https:\/\//.test(u)) continue;
    const a = el('a', null, label); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', label + '에서 보기 (새 창)'); shops.append(a);
  }
  if (shops.children.length) buy.append(el('h3', null, '서점에서 보기'), shops);
  const ph = 474 / b.a;
  poster.setAttribute('viewBox', `0 0 474 ${ph.toFixed(1)}`); pcr.setAttribute('height', ph.toFixed(1)); pimg.setAttribute('height', ph.toFixed(1)); pimg.setAttribute('href', b.img);
  circles.forEach(([x, y], k) => { circEls[k].setAttribute('cx', x); circEls[k].setAttribute('cy', (y * ph / 900).toFixed(1)); circEls[k].setAttribute('r', 0); });
  const relS = $('dRelS'), relK = $('dRelK');
  const sameS = b.series ? ALL.filter(x => x.series === b.series && x.id !== b.id).sort((a, c) => a.y - c.y) : [];
  const score = x => x.kw.filter(k => b.kw.includes(k)).length * 3 + (x.tgt === b.tgt ? 2 : 0) - Math.abs(x.y - b.y) * .05;
  const sameK = ALL.filter(x => x.id !== b.id && (!b.series || x.series !== b.series)).filter(x => x.kw.some(k => b.kw.includes(k))).sort((a, c) => score(c) - score(a)).slice(0, 6);
  for (const [box, list] of [[relS, sameS], [relK, sameK]]) {
    const row = box.querySelector('.row'); row.textContent = '';
    list.forEach(x => row.append(cardFor(x))); box.hidden = !list.length;
  }
}
function openDetail(b) {
  const fresh = openId === null;
  if (!fresh && openId === b.id) return;
  const fast = RM.matches;
  inkFast = opens > 0; opens++;
  if (fresh) {
    lastFocus = document.activeElement;
    const r = originRect(b); closeRect = r;
    fillDetail(b); openId = b.id;
    detail.hidden = false; detail.scrollTop = 0;
    inkT0 = fast ? performance.now() - 5000 : performance.now();
    detail.getAnimations().forEach(a => a.cancel());
    detail.animate([{ clipPath: insetFrom(r) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: fast ? 1 : (inkFast ? 620 : 1050), easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
  } else {
    fillDetail(b); openId = b.id; detail.scrollTo({ top: 0 });
    inkT0 = fast ? performance.now() - 5000 : performance.now() - 200;
  }
  const lead = fast ? 0 : fresh ? (inkFast ? 260 : 620) : 0;
  [...$('dtext').querySelectorAll('.m > *')].forEach((n, k) => {
    n.getAnimations().forEach(a => a.cancel());
    n.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration: fast ? 1 : (inkFast ? 600 : 900), delay: fast ? 0 : lead + k * (inkFast ? 45 : 75), easing: EASE, fill: 'both' });
  });
  $('close').textContent = $('closeB').textContent = closeLabel();
  // 컴퓨터는 닫기에 초점(키보드로 바로 닫기). 휴대폰은 위 단추를 숨기고 아래 고정 줄을 쓰므로, 아래 단추가 눌린 것처럼 보이지 않게 상세 화면 자체에 초점을 둔다
  setTimeout(() => ($('close').offsetParent ? $('close') : detail).focus({ preventScroll: true }), fast ? 0 : 350);
}
function closeDetail() {
  if (openId === null) return;
  const b = BYID.get(openId); openId = null;
  let r = originRect(b);
  const an = detail.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFrom(r) }], { duration: RM.matches ? 1 : 700, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
  an.onfinish = () => { if (openId !== null) return; detail.hidden = true; detail.getAnimations().forEach(a => a.cancel()); detail.querySelectorAll('.m > *').forEach(n => n.getAnimations().forEach(a => a.cancel())); };
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
}
for (const id of ['close', 'closeB']) $(id).addEventListener('click', () => go(closeTo()));
// ISBN 복사: 숫자 13자리만 복사하고 2초 동안 '복사했어요' ('주소 복사'와 같은 단추)
function isbnCopyBtn(isbn) {
  const bt = el('button', 'box lbl icopy', '복사'); bt.type = 'button'; bt.setAttribute('aria-label', 'ISBN ' + isbn + ' 복사');
  bt.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(isbn); } catch { prompt('이 ISBN을 복사하세요', isbn); return; }
    bt.textContent = '복사했어요'; bt.classList.add('copied');
    clearTimeout(bt._t); bt._t = setTimeout(() => { bt.textContent = '복사'; bt.classList.remove('copied'); }, 2000);
  });
  return bt;
}
// '주소 복사'(컴퓨터 위 단추): 지금 책의 주소를 복사하고 2초 동안 '복사했어요'. 글자만 바뀐다. (2026-11-08)
// '공유'(휴대폰 아래 줄): 휴대폰 공유 창(카톡·문자로 바로 보내기). 공유 창이 없는 브라우저는 주소 복사.
const bookAddr = () => { const b = openId !== null && BYID.get(openId); return b && BYPATH ? location.origin + urlFor('b-' + b.id) : location.href; };
async function copyAddr(bt, label) {
  const addr = bookAddr();
  try { await navigator.clipboard.writeText(addr); } catch { prompt('이 주소를 복사하세요', addr); return; }
  bt.textContent = '복사했어요'; bt.classList.add('copied');
  clearTimeout(bt._t); bt._t = setTimeout(() => { bt.textContent = label; bt.classList.remove('copied'); }, 2000);
}
$('share').addEventListener('click', () => copyAddr($('share'), '주소 복사'));
$('shareB').addEventListener('click', async () => {
  const b = openId !== null && BYID.get(openId);
  if (navigator.share) {
    try { await navigator.share({ title: b ? `${b.title} · ${SITE.author}` : document.title, url: bookAddr() }); } catch (_) { /* 닫거나 취소함 */ }
    return;
  }
  copyAddr($('shareB'), '공유');
});
detail.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...detail.querySelectorAll('button,a[href]')].filter(n => n.offsetParent !== null);
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); }
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (openId !== null) go(closeTo()); else if (view !== 'shelf') go('shelf'); return; }
  if (overlay()) return;
  if (e.target.closest && e.target.closest('input,select')) return;
  if (e.key === 'ArrowLeft') { T = Math.round(T) - 1; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { T = Math.round(T) + 1; e.preventDefault(); }
  else if (e.key === 'Enter' && (document.activeElement === shelf || document.activeElement === document.body)) { e.preventDefault(); openShelfBook(); }
});

/* ---------- boot ---------- */
document.addEventListener('touchstart', () => {}, { passive: true }); // 아이폰 사파리에서 누르는 동안 모양(:active)이 보이게
/* 휴대폰 글자 키움 대응 (2026-11-10): 실제로 그려진 높이를 재서 겹치지 않게 놓는다. 기본 글자 크기에서는 아무것도 바꾸지 않는다 */
const topEl = document.querySelector('.top'), ttlEl = document.querySelector('.ttl'), footEl = document.querySelector('.foot'), grEl = $('gr'), capEl = $('cap'), rootS = document.documentElement.style;
function fitTop() {
  topEl.classList.remove('t1', 't2');
  for (const c of ['t1', 't2']) { if (topEl.scrollWidth <= topEl.clientWidth + 1) break; topEl.classList.add(c); }
}
function fitYears() {
  let lastR = -1e9;
  for (const y of tl.querySelectorAll('.yr')) {
    y.classList.remove('hid');
    if (getComputedStyle(y).display === 'none') continue;
    const r = y.getBoundingClientRect();
    if (r.left < lastR + 6) y.classList.add('hid'); else lastR = r.right;
  }
}
function lineH(cls) { // 두 줄짜리 글자 높이(글자 키움이 반영된 실제 높이)
  const t = el('div', cls, '가 가'); Object.assign(t.style, { position: 'absolute', visibility: 'hidden', width: '1px', left: '0', top: '0' });
  capEl.append(t); const h = t.offsetHeight; t.remove(); return h;
}
function fitHome() {
  rootS.removeProperty('--H'); rootS.removeProperty('--cy'); rootS.removeProperty('--capgap');
  grEl.classList.remove('g3'); grEl.style.bottom = ''; tl.style.bottom = ''; document.querySelectorAll('.kan').forEach(k => k.classList.remove('off'));
  fitTop(); fitYears();
  if (innerWidth >= 768) return;
  if ([...grEl.querySelectorAll('button')].some(b => b.scrollWidth > b.clientWidth + 1)) grEl.classList.add('g3');
  const vh = innerHeight;
  // 트랙: 연도 글자가 아래 단추에 닿으면 올린다
  const footTop = footEl.getBoundingClientRect().top, tr = tl.getBoundingClientRect();
  const yrB = Math.max(tr.bottom, ...[...tl.querySelectorAll('.yr')].map(y => y.getBoundingClientRect().bottom));
  if (yrB > footTop - 6) tl.style.bottom = (vh - tr.bottom + yrB - footTop + 6) + 'px';
  // 학년 줄: 트랙(캐릭터 머리 포함)에 닿으면 올린다
  const tlTop = tl.getBoundingClientRect().top - 14, gr0 = grEl.getBoundingClientRect();
  if (gr0.bottom > tlTop) grEl.style.bottom = (vh - tlTop) + 'px';
  // 진열대·캡션: 제목 줄과 학년 줄 사이에 들어가지 않으면 책을 줄인다(가안)
  const grTop = grEl.getBoundingClientRect().top - 10, ttlB = ttlEl ? ttlEl.getBoundingClientRect().bottom + 10 : 70;
  const capMax = lineH('ctitle') + lineH('csub') + lineH('cyear') / 2 + 1 + 30;
  const H0 = probe.getBoundingClientRect().height, cy0 = shelf.getBoundingClientRect().top + 50 + H0 / 2, gap0 = vh * .042;
  if (cy0 - H0 * .53 >= ttlB && cy0 + H0 / 2 + gap0 + capMax <= grTop) return;
  const gap = Math.min(gap0, 14), Hn = Math.max(90, Math.min(H0, (grTop - capMax - gap - ttlB) / 1.06));
  rootS.setProperty('--H', Hn + 'px'); rootS.setProperty('--cy', (ttlB + Hn * .53) + 'px'); rootS.setProperty('--capgap', gap + 'px');
  if (Hn < H0 * .85) document.querySelectorAll('.kan').forEach(k => k.classList.add('off'));
}
const relayout = () => { fitHome(); measure(); };
relayout();
addEventListener('resize', relayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
const h0 = curRoute();
if (h0.startsWith('b-') && BYID.has(h0.slice(2))) { const bi = BOOKS.findIndex(b => b.id === h0.slice(2)); if (bi >= 0) { s = T = bi + N; } }
route(); booted = true;
requestAnimationFrame(t => { last = t; frame(t); });
})();
