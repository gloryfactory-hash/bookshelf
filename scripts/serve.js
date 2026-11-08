// dist를 GitHub Pages처럼 보여 주는 작은 서버. 책 주소(…/<ISBN>/)를 확인하려면 파일로 열지 말고 이걸로 연다. 2026-11-08
//   폴더 → 그 안의 index.html, 끝 '/'가 없으면 붙여서 다시 보냄, 없는 파일은 404
// 사용법: node scripts/serve.js [포트]   (npm run dev가 빌드 뒤에 띄운다)
// shot.js에서는 serve(dir)를 가져다 쓴다.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
export function serve(dir, port = 0) {
  const s = http.createServer((req, res) => {
    let u;
    try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    let f = path.join(dir, u);
    if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!u.endsWith('/')) { res.writeHead(301, { Location: encodeURI(u) + '/' }).end(); return; }
      f = path.join(f, 'index.html');
    }
    if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 없는 주소입니다'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => s.listen(port, '127.0.0.1', () => r(s)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const s = await serve(dist, Number(process.argv[2]) || 4173);
  console.log(`http://127.0.0.1:${s.address().port}/  (멈추려면 Ctrl+C)`);
}
