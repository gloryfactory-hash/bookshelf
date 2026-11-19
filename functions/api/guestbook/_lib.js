// 방명록 공통 (2026-11-19). 비밀 값은 Cloudflare 설정에만 둔다:
// TURNSTILE_SECRET, ADMIN_KEY, NOTIFY_TO(쉼표로 여러 주소), RESEND_KEY, MAIL_FROM. 묶음: DB(D1), AI(Workers AI, 없으면 규칙 검사만)
export const SITE = 'limjihyung';
export const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const len = s => [...s].length;

// 1차 규칙: 걸리면 보류(공개하지 않음)
const RULES = [
  [/(01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/, '전화번호'],
  [/https?:\/\/|www\.|\.(com|net|kr|co|io|xyz|shop)\b/i, '링크'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, '메일 주소'],
  [/[가-힣]{2,}(초등학교|중학교|고등학교|초교|중학|초)\s*\d|[가-힣]{2,}(초등학교|중학교|고등학교)/, '학교 이름'],
  [/\d+\s*학년\s*\d+\s*반/, '학년·반'],
  [/[가-힣]+(동|로|길)\s*\d+(-\d+)?|아파트\s*\d+\s*동/, '주소'],
  [/카톡|오픈채팅|텔레그램|디엠|dm|부업|수익|대출|카지노|토토|코인/i, '광고 의심'],
  [/시발|씨발|ㅅㅂ|병신|ㅂㅅ|개새|좆|존나|섹스|fuck/i, '욕설'],
];
export function ruleCheck(t) { for (const [re, why] of RULES) if (re.test(t)) return why; return null; }

// 2차 AI 검사: 애매하면 보류 쪽으로
export async function aiCheck(env, name, body) {
  if (!env.AI) return null;
  try {
    const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: '너는 어린이도 보는 동화 작가 방명록의 검토자다. 글이 아래 중 하나라도 해당하면 hold, 아니면 ok. 1) 욕설·비하·성적·폭력적 표현 2) 광고·홍보·스팸 3) 개인을 알아볼 수 있는 정보(실명+학교, 반, 연락처, 주소, SNS 아이디) 4) 다른 사람을 놀리거나 괴롭히는 말 5) 책·작가와 상관없는 이상한 글. 확신이 없으면 hold. 답은 JSON 한 줄만: {"v":"ok"} 또는 {"v":"hold","why":"짧은 까닭"}' },
        { role: 'user', content: `이름: ${name}\n글: ${body}` },
      ], max_tokens: 60, temperature: 0,
    });
    // 답이 글자로 올 때도, 이미 풀린 객체로 올 때도 있다(2026-11-19 확인)
    const raw = r?.response ?? r?.choices?.[0]?.message?.content ?? r;
    let o = raw && typeof raw === 'object' && 'v' in raw ? raw : null;
    if (!o) { const m = String(typeof raw === 'string' ? raw : JSON.stringify(raw)).match(/\{[^{}]*"v"[^{}]*\}/); o = m ? JSON.parse(m[0]) : null; }
    if (!o || o.v !== 'ok') return 'AI: ' + (o?.why || '판단 못 함');
    return null;
  } catch (e) { return 'AI 검사 실패: ' + String(e?.message || e).slice(0, 80); }
}

export async function notify(env, e) {
  if (!env.RESEND_KEY || !env.NOTIFY_TO) return '메일 설정 없음';
  const to = env.NOTIFY_TO.split(',').map(s => s.trim()).filter(Boolean);
  const admin = (env.SITE_URL || 'https://limjh.kr/') + 'guestbook/admin/';
  const text = `방명록에 확인할 글이 들어왔어요 (보류 까닭: ${e.reason})\n\n이름: ${e.name}\n글: ${e.body}\n\n관리 화면: ${admin}\n(관리 열쇠는 처음 한 번만 넣으면 그 브라우저가 기억해요)`;
  return fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || '서가 방명록 <onboarding@resend.dev>', to, subject: '[서가 방명록] 확인할 글 1개', text }) })
    .then(async r => r.ok ? '보냄' : '메일 실패 ' + r.status + ' ' + (await r.text()).slice(0, 120)).catch(e => '메일 실패 ' + String(e?.message || e).slice(0, 80));
}

export async function ipHash(req) {
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gb:' + ip));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function isAdmin(req, env) { return env.ADMIN_KEY && req.headers.get('x-admin-key') === env.ADMIN_KEY; }
