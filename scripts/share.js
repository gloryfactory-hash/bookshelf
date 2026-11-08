// og.js와 build.js가 함께 쓰는 규칙.
// 진열대 가운데 책과 같은 순서 (src/app.js newestFirst)
export const newestFirst = (a, b) => b.y - a.y || a.title.localeCompare(b.title, 'ko');
// 서가 대표 책 (2026-11-08): sites/*.json의 leadBook(ISBN 또는 ID)을 정하면 그 책, 없으면 신간.
// 첫 화면 진열대 가운데 책이자 서가 미리보기(카톡 등) 그림·설명의 책. 임지형은 신간이 앤솔러지라 작가 요청으로 'ONE MORE!'.
export function shareBookOf(site, list) {
  if (!site.leadBook) return list.slice().sort(newestFirst)[0];
  const b = list.find(x => x.isbn === site.leadBook || x.id === site.leadBook);
  if (!b) throw new Error(`[${site.slug}] leadBook '${site.leadBook}'인 책이 이 서가에 없습니다.`);
  return b;
}
