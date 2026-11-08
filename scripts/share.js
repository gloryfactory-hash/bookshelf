// og.js와 build.js가 함께 쓰는 규칙.
// 진열대 가운데 책과 같은 순서 (src/app.js newestFirst)
export const newestFirst = (a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko');
// 서가 미리보기(카톡 등)에 쓸 책 (2026-11-08): sites/*.json의 shareBook(ISBN 또는 ID)을 정하면 그 책, 없으면 신간.
// 임지형은 신간이 앤솔러지라 작가 요청으로 'ONE MORE!'를 쓴다. 진열대 첫 화면 순서는 바꾸지 않는다.
export function shareBookOf(site, list) {
  if (!site.shareBook) return list.slice().sort(newestFirst)[0];
  const b = list.find(x => x.isbn === site.shareBook || x.id === site.shareBook);
  if (!b) throw new Error(`[${site.slug}] shareBook '${site.shareBook}'인 책이 이 서가에 없습니다.`);
  return b;
}
