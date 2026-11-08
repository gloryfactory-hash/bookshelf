// data/books.csv(노션 내보내기 형식) → data/books.json
// 규칙 검사를 통과하지 못하면 books.json을 쓰지 않고 멈춘다.
//
// 사용법:
//   node scripts/import.js
//   node scripts/import.js --csv "경로/작품 목록 ....csv"          노션에서 새로 내보낸 CSV를 data/books.csv로 복사한 뒤 진행
//   node scripts/import.js --notion-export "압축 푼 노션 폴더"      표지가 data/covers에 없으면 노션 내보내기 폴더에서 ID 이름으로 복사
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(root, ...p);
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

const csvArg = arg('--csv');
if (csvArg) { fs.copyFileSync(path.resolve(csvArg), P('data', 'books.csv')); console.log('CSV 복사:', csvArg, '→ data/books.csv'); }
const notionDir = arg('--notion-export');

const vocab = JSON.parse(fs.readFileSync(P('data', 'vocab.json'), 'utf8'));
const TARGETS = new Set(vocab.targets.map(t => t.name));
const KEYWORDS = new Set(vocab.keywords);
const rows = parse(fs.readFileSync(P('data', 'books.csv'), 'utf8').replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true });

const errors = [], warns = [];
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const https = v => /^https:\/\//.test(v || '') ? v : null;
const COVER_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const findCover = id => COVER_EXT.map(e => P('data', 'covers', id + e)).find(f => fs.existsSync(f));
const ids = new Set(), isbns = new Set();

const books = rows.map((r, i) => {
  const line = `${i + 2}행 「${r['제목'] || '(제목 없음)'}」`;
  const err = m => errors.push(`${line}: ${m}`), warn = m => warns.push(`${line}: ${m}`);

  let id = (r['ID'] || '').trim();
  if (!id) { const m = /goods\/(\d+)/.exec(r['YES24'] || ''); if (m) { id = 'y' + m[1]; warn(`ID가 비어 있어 YES24 번호로 ${id}를 만들었습니다. 노션에도 적어 두세요.`); } }
  if (!id) err('ID가 없습니다. (YES24 상품 번호 앞에 y를 붙인 형식, 예: y197978309)');
  else if (!/^[a-z0-9-]+$/i.test(id)) err(`ID "${id}"에 영문, 숫자, 하이픈 말고 다른 글자가 있습니다.`);
  else if (ids.has(id)) err(`ID "${id}"가 다른 책과 겹칩니다.`);
  ids.add(id);

  for (const k of ['제목', '작가', '대상', '주제 키워드', '출간년도', '출판사', '한줄평', '소개']) if (!(r[k] || '').trim()) err(`'${k}'이(가) 비어 있습니다.`);
  const authors = list(r['작가']);
  const tgt = (r['대상'] || '').trim();
  if (tgt && !TARGETS.has(tgt)) err(`대상 "${tgt}"는 목록에 없습니다. (${[...TARGETS].join(', ')})`);
  const kw = list(r['주제 키워드']);
  for (const k of kw) if (!KEYWORDS.has(k)) err(`주제 키워드 "${k}"는 목록에 없습니다. data/vocab.json을 확인하세요.`);
  if (kw.length > vocab.maxKeywords) err(`주제 키워드가 ${kw.length}개입니다. ${vocab.maxKeywords}개까지만 붙입니다.`);

  const ed = parseInt(r['출간년도'], 10), first = parseInt(r['첫 출간년도'], 10);
  if (Number.isNaN(ed)) err('출간년도가 숫자가 아닙니다.');
  const y = Number.isNaN(first) ? ed : first;
  if (!Number.isNaN(first) && first > ed) err('첫 출간년도가 출간년도보다 늦습니다.');

  const one = (r['한줄평'] || '').trim(), desc = (r['소개'] || '').replace(/\s*\n\s*/g, ' ').trim();
  if (one.length > 45) warn(`한줄평이 ${one.length}자입니다. 캡션에서 두 줄을 넘을 수 있습니다.`);
  if (desc.length > 260) warn(`소개가 ${desc.length}자입니다. 다른 책들은 150~230자입니다.`);

  const links = {};
  for (const [k, col] of [['yes24', 'YES24'], ['kyobo', '교보문고'], ['aladin', '알라딘']]) { const u = https(r[col]); if (u) links[k] = u; else if (r[col]) warn(`${col} 링크가 https로 시작하지 않아 뺐습니다.`); }
  if (!links.yes24) warn('YES24 링크가 없습니다.');

  if (id && !findCover(id) && notionDir && r['표지']) {
    const src = path.join(path.resolve(notionDir), decodeURIComponent(r['표지']));
    if (fs.existsSync(src)) { fs.copyFileSync(src, P('data', 'covers', id + path.extname(src).toLowerCase())); console.log(`표지 복사: ${r['제목']} → data/covers/${id}${path.extname(src)}`); }
  }
  // ISBN(종이책 ISBN13). 책 주소(…/<ISBN>/)와 미리보기 그림 이름에 쓴다. 2026-11-08
  const isbn = (r['ISBN'] || '').replace(/[-\s]/g, '');
  if (!isbn) warn('ISBN이 비어 있습니다. 책 주소가 ISBN 대신 ID로 만들어집니다. 노션에 적어 주세요.');
  else if (!/^97[89]\d{10}$/.test(isbn)) err(`ISBN "${r['ISBN']}"이 13자리 숫자가 아닙니다.`);
  else if ([...isbn].reduce((s, d, k) => s + d * (k % 2 ? 3 : 1), 0) % 10) err(`ISBN "${isbn}"의 끝자리(검사 숫자)가 맞지 않습니다. 옮겨 적다 틀린 곳이 없는지 확인하세요.`);
  else if (isbns.has(isbn)) err(`ISBN "${isbn}"이 다른 책과 겹칩니다.`);
  isbns.add(isbn);
  // 쪽수(종이책). 상세 화면 도서 정보에 쓴다. 2026-11-08
  const pg = String(r['쪽수'] || '').replace(/[^\d]/g, '');
  if (!pg) warn('쪽수가 비어 있습니다. 노션에 적어 주세요.');
  else if (+pg < 8 || +pg > 2000) err(`쪽수 "${r['쪽수']}"가 이상합니다.`);

  const cover = id && findCover(id);
  if (id && !cover) err(`표지 파일이 없습니다. data/covers/${id}.jpg 로 넣어 주세요.`);

  return {
    id, isbn: /^\d{13}$/.test(isbn) ? isbn : null, pages: pg ? +pg : null, title: (r['제목'] || '').trim(), authors, tgt, kw, cat: (r['분류'] || '').trim(), y, ed: ed !== y ? ed : null,
    pub: (r['출판사'] || '').trim(), series: (r['시리즈'] || '').trim() || null,
    feat: /^(yes|y|예|true|1)$/i.test((r['대표작'] || '').trim()), one, desc, rec: list(r['추천·선정']),
    links, cover: cover ? path.basename(cover) : null
  };
});

const titles = new Map();
for (const b of books) { if (titles.has(b.title)) warns.push(`「${b.title}」 제목이 두 번 나옵니다. 같은 책을 두 번 넣은 건 아닌지 확인하세요.`); titles.set(b.title, 1); }

if (warns.length) { console.log(`\n확인할 것 ${warns.length}건`); warns.forEach(w => console.log('  · ' + w)); }
if (errors.length) { console.error(`\n고쳐야 할 것 ${errors.length}건 (books.json을 쓰지 않았습니다)`); errors.forEach(e => console.error('  ✗ ' + e)); process.exit(1); }

books.sort((a, b) => a.y - b.y || a.title.localeCompare(b.title, 'ko'));
fs.writeFileSync(P('data', 'books.json'), JSON.stringify(books, null, 1) + '\n');
const by = {}; for (const b of books) for (const a of b.authors) by[a] = (by[a] || 0) + 1;
console.log(`\nbooks.json 저장: ${books.length}권 (${Object.entries(by).map(([a, n]) => `${a} ${n}`).join(', ')})`);
