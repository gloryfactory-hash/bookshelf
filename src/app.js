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
function curRoute() {
  if (BYPATH && location.pathname.startsWith(ROOT)) {
    const rest = location.pathname.slice(ROOT.length).replace(/index\.html$/, '').replace(/\/$/, '');
    const b = BYKEY.get(rest) || BYID.get(rest);
    if (b) return 'b-' + b.id;
  }
  const h = location.hash.slice(1), b = BYKEY.get(h);
  return b ? 'b-' + b.id : h;
}
function urlFor(h) {
  if (h.startsWith('b-') && BYID.has(h.slice(2))) { const b = BYID.get(h.slice(2)); return ROOT + (b.isbn || b.id) + '/'; }
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
const N = BOOKS.length, COPIES = Math.max(2, Math.ceil(30 / N)), TOT = N * COPIES, P = 1400;
const START = 0;
const $ = id => document.getElementById(id);
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => x * x * (3 - 2 * x);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const stage = $('stage'), shelf = $('shelf'), probe = $('probe'), ring = $('ring');
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
  e.append(sp, cv); stage.append(e);
  tapes.push({ v, b, el: e, sp, cv, lift: 0, hidden: false, o: 0, z: -1e9 });
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
const tOf = b => b.y + .5;

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
let active = -1, dragging = false, hovered = null;
let mx = innerWidth / 2, my = innerHeight / 2;
let tiltX = 0, tiltY = 0, dotY = tOf(BOOKS[START]), ringScale = 0;
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
    if (Math.abs(s) > N * 40) { const sh = Math.round(s / N) * N - N; s -= sh; T -= sh; }
    const ai = mod(Math.round(s), N);
    if (ai !== active) { const dir = active < 0 ? 0 : (Math.sign(T - s) || 1); active = ai; setCaption(ai, dir); }
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
      t.cv.style.setProperty('--shade', ((1 - o) * .82).toFixed(3));
    }
    const rWant = shelfLive ? smooth(Math.max(0, 1 - Math.abs(T - s) * 3)) : 0;
    ringScale = RM.matches ? rWant : ringScale + (rWant - ringScale) * (1 - Math.exp(-10 * dt));
    const pz = P / (P - H * .1);
    ring.style.left = (W / 2 - dOpen / 2 * pz - 6) + 'px'; ring.style.top = (shelfC + .36 * H * pz) + 'px';
    ring.style.transform = `scale(${ringScale.toFixed(3)})`;
    const i0 = Math.floor(s), f = s - i0, ya = tOf(BOOKS[mod(i0, N)]), yb = tOf(BOOKS[mod(i0 + 1, N)]);
    const yy = yb < ya ? (f < .5 ? ya : yb) : ya + (yb - ya) * f;
    if (Math.abs(yy - dotY) > 6 || RM.matches) dotY = yy; else dotY += (yy - dotY) * (1 - Math.exp(-14 * dt));
    dot.style.left = ((dotY - Y0) / (Y1 - Y0) * 100) + '%';
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
ring.addEventListener('click', () => openShelfBook());
$('tlhit').addEventListener('click', e => {
  const r = tl.getBoundingClientRect(), t = Y0 + clamp((e.clientX - r.left) / r.width, 0, 1) * (Y1 - Y0);
  let best = 0, bd = 1e9; BOOKS.forEach((b, i) => { const d = Math.abs(tOf(b) - t); if (d < bd) { bd = d; best = i; } });
  T = Math.round(T) + mod(best - mod(Math.round(T), N) + Math.floor(N / 2), N) - Math.floor(N / 2);
});
function openShelfBook() { T = Math.round(T); go('b-' + BOOKS[mod(T, N)].id); }

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
// 휴대폰에서는 주제를 두 줄만 보이고 '주제 모두 보기'로 펼친다. 고른 주제는 늘 보인다.
const more = el('button', 'more'); more.type = 'button';
more.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0v10M0 5h10" stroke="currentColor" stroke-width="1.4"/></svg><span></span>';
chips.append(more);
const MOB = matchMedia('(max-width:767px)');
let chipsOpen = false;
function foldChips() {
  const list = chipBtns.map(x => x[1]);
  list.forEach(c => c.classList.remove('fold'));
  more.hidden = !MOB.matches;
  if (!MOB.matches || lib.hidden) return;
  more.setAttribute('aria-expanded', String(chipsOpen));
  more.lastChild.textContent = chipsOpen ? '접기' : '주제 모두 보기 ' + list.length;
  if (chipsOpen) return;
  const limit = list[0].offsetTop + list[0].offsetHeight * 1.5 + 8; // 두 번째 줄까지
  for (let i = list.length - 1; i >= 0 && more.offsetTop > limit; i--) {
    if (list[i].getAttribute('aria-pressed') !== 'true') list[i].classList.add('fold');
  }
}
more.addEventListener('click', () => { chipsOpen = !chipsOpen; foldChips(); });
addEventListener('resize', foldChips);
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
  foldChips();
  const list = ALL.filter(b => pass(b)).sort(sorter);
  activeBar.textContent = '';
  const tags = [];
  if (F.series) tags.push(['시리즈: ' + F.series, () => { F.series = null; }]);
  if (F.tgt) tags.push([F.tgt, () => { F.tgt = null; }]);
  if (F.kw) tags.push([F.kw, () => { F.kw = null; }]);
  if (F.q) tags.push(['“' + F.q + '”', () => { F.q = ''; $('q').value = ''; }]);
  if (tags.length) activeBar.append(el('span', null, list.length + '권')); // 조건이 없으면 제목의 '전체 작품 70권'과 겹치니 빼다
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
function resetF() { F.tgt = F.kw = F.series = null; F.q = ''; $('q').value = ''; renderLib(); }
$('libNote').textContent = SITE.note || '';

/* ---------- 첫 화면 학년 줄: 누르면 다른 조건을 지우고 그 학년만 고른 서고를 연다 ---------- */
const SHORT = { 저학년: '1~2학년', 중학년: '3~4학년', 고학년: '5~6학년', 청소년: '중·고등', 일반: '어른' };
for (const t of SITE.targets) {
  const n = ALL.filter(b => b.tgt === t.name).length; if (!n) continue;
  const bt = el('button'); bt.append(el('b', null, SHORT[t.name] || t.name), el('span', 'n', n + '권'));
  bt.setAttribute('aria-label', `${t.label}(${t.name}) 책 ${n}권 보기`);
  bt.addEventListener('click', () => { F.tgt = t.name; F.kw = F.series = null; F.q = ''; $('q').value = ''; go('books'); });
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
// '#'로 시작하는 링크(작가 화면의 책 이름, '강연 문의')도 go로 보낸다. 시리즈 링크처럼 먼저 처리한 것은 건드리지 않는다.
if (BYPATH) document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const l = e.target.closest && e.target.closest('a[href^="#"]'); if (!l) return;
  e.preventDefault(); go(l.getAttribute('href').slice(1));
});
// 서고(lib)와 작가 화면(about)은 진열대 위에 아래에서 올라오는 판이다. 한 번에 하나만 열린다.
const about = $('about');
const PANELS = { lib, about };
// 서고·작가 화면이 덮고 있을 때는 뒤의 진열대로 Tab이 가지 않게 한다.
const BEHIND = ['shelf', 'prev', 'next', 'ring', 'gr'].map($).concat([...document.querySelectorAll('.foot')]);
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
      p.hidden = false; p.scrollTop = 0; p.style.zIndex = 52; if (k === 'lib') foldChips();
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
function route() {
  const h = curRoute();
  const ob = h.startsWith('b-') && BYID.get(h.slice(2));
  document.title = ob ? `${ob.title} · ${SITE_TITLE}` : SITE_TITLE;
  if (BYPATH && ob && location.hash.startsWith('#')) history.replaceState(null, '', urlFor(h)); // 예전 '#b-…' 주소는 책 주소로 바꿔 준다
  if (h.startsWith('b-') && BYID.has(h.slice(2))) { openDetail(BYID.get(h.slice(2))); return; }
  if (openId !== null) closeDetail();
  view = h === 'books' ? 'lib' : (about && ABOUT_HASH.includes(h)) ? 'about' : 'shelf';
  showPanel(view, view === 'about' && h !== 'about' ? h : null);
  if (view === 'shelf' && booted) shelf.focus({ preventScroll: true });
}
let booted = false;
$('navShelf').addEventListener('click', () => go('shelf'));
$('navLib').addEventListener('click', () => go('books'));
$('footLib').addEventListener('click', () => go('books'));
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
  for (const k of b.kw) { const bt = el('button', null, k); bt.addEventListener('click', () => { F.tgt = null; F.kw = k; F.series = null; F.q = ''; $('q').value = ''; go('books'); }); kw.append(bt); }
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
  const buy = $('dBuy'); buy.textContent = '';
  for (const [k, label] of [['yes24', 'YES24'], ['kyobo', '교보문고'], ['aladin', '알라딘']]) {
    const u = b.links[k]; if (!u || !/^https:\/\//.test(u)) continue;
    const a = el('a', null, label + '에서 보기'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; buy.append(a);
  }
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
  setTimeout(() => $('close').focus({ preventScroll: true }), fast ? 0 : 350);
}
function closeDetail() {
  if (openId === null) return;
  const b = BYID.get(openId); openId = null;
  let r = originRect(b);
  const an = detail.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFrom(r) }], { duration: RM.matches ? 1 : 700, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
  an.onfinish = () => { if (openId !== null) return; detail.hidden = true; detail.getAnimations().forEach(a => a.cancel()); detail.querySelectorAll('.m > *').forEach(n => n.getAnimations().forEach(a => a.cancel())); };
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
}
$('close').addEventListener('click', () => go(back()));
// ISBN 복사: 숫자 13자리만 복사하고 2초 동안 '복사했어요' ('주소 복사'와 같은 단추)
function isbnCopyBtn(isbn) {
  const bt = el('button', 'box lbl icopy', '복사'); bt.type = 'button'; bt.setAttribute('aria-label', 'ISBN ' + isbn + ' 복사');
  bt.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(isbn); } catch { prompt('이 ISBN을 복사하세요', isbn); return; }
    bt.textContent = '복사했어요'; bt.classList.add('done');
    clearTimeout(bt._t); bt._t = setTimeout(() => { bt.textContent = '복사'; bt.classList.remove('done'); }, 2000);
  });
  return bt;
}
// '주소 복사': 지금 책의 주소를 복사하고 2초 동안 '복사했어요'. 글자만 바뀐다. (2026-11-08)
$('share').addEventListener('click', async () => {
  const bt = $('share'), b = openId !== null && BYID.get(openId);
  const addr = b && BYPATH ? location.origin + urlFor('b-' + b.id) : location.href;
  try { await navigator.clipboard.writeText(addr); } catch { prompt('이 주소를 복사하세요', addr); return; }
  bt.textContent = '복사했어요'; bt.classList.add('done');
  clearTimeout(bt._t); bt._t = setTimeout(() => { bt.textContent = '주소 복사'; bt.classList.remove('done'); }, 2000);
});
detail.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...detail.querySelectorAll('button,a[href]')].filter(n => n.offsetParent !== null);
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); }
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (openId !== null) go(back()); else if (view !== 'shelf') go('shelf'); return; }
  if (overlay()) return;
  if (e.target.closest && e.target.closest('input,select')) return;
  if (e.key === 'ArrowLeft') { T = Math.round(T) - 1; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { T = Math.round(T) + 1; e.preventDefault(); }
  else if (e.key === 'Enter' && (document.activeElement === shelf || document.activeElement === document.body)) { e.preventDefault(); openShelfBook(); }
});

/* ---------- boot ---------- */
measure();
addEventListener('resize', measure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
const h0 = curRoute();
if (h0.startsWith('b-') && BYID.has(h0.slice(2))) { const bi = BOOKS.findIndex(b => b.id === h0.slice(2)); if (bi >= 0) { s = T = bi + N; } }
route(); booted = true;
requestAnimationFrame(t => { last = t; frame(t); });
})();
