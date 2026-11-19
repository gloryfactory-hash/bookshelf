import { SITE, json, len, ruleCheck, aiCheck, notify, ipHash } from './_lib.js';
const PAGE = 20;

// 공개 글 목록
export async function onRequestGet({ request, env }) {
  const before = Number(new URL(request.url).searchParams.get('before')) || 9e15;
  const { results } = await env.DB.prepare("SELECT id,name,body,reply,reply_by,created_at FROM entries WHERE site=? AND status='public' AND created_at<? ORDER BY created_at DESC LIMIT ?").bind(SITE, before, PAGE + 1).all();
  const total = (await env.DB.prepare("SELECT COUNT(*) n FROM entries WHERE site=? AND status='public'").bind(SITE).first()).n;
  const items = results.slice(0, PAGE);
  return json({ items, total, next: results.length > PAGE ? items.at(-1).created_at : null });
}

// 글 남기기
export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { return json({ error: '보낸 내용을 읽지 못했어요.' }, 400); }
  const name = String(d.name || '').trim().replace(/\s+/g, ' '), body = String(d.body || '').trim().replace(/\n{3,}/g, '\n\n');
  if (d.website) return json({ status: 'held' });                       // 로봇이 채우는 숨은 칸
  if (!name || len(name) > 20) return json({ error: '이름이나 별명은 20자까지 적어 주세요.' }, 400);
  if (len(body) < 2 || len(body) > 300) return json({ error: '남길 말은 2~300자로 적어 주세요.' }, 400);

  if (env.TURNSTILE_SECRET) {
    const f = new FormData(); f.append('secret', env.TURNSTILE_SECRET); f.append('response', d.token || ''); f.append('remoteip', request.headers.get('cf-connecting-ip') || '');
    const v = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f })).json().catch(() => ({}));
    if (!v.success) return json({ error: '사람인지 확인하지 못했어요. 새로 고침 뒤 다시 해 주세요.' }, 403);
  }
  const ip = await ipHash(request), now = Date.now();
  const recent = (await env.DB.prepare('SELECT COUNT(*) n FROM entries WHERE ip=? AND created_at>?').bind(ip, now - 10 * 60e3).first()).n;
  if (recent >= 3) return json({ error: '조금 뒤에 다시 남겨 주세요.' }, 429);

  const reason = ruleCheck(name + '\n' + body) || await aiCheck(env, name, body);
  const status = reason ? 'held' : 'public';
  const ins = await env.DB.prepare('INSERT INTO entries (site,name,body,status,reason,ip,created_at) VALUES (?,?,?,?,?,?,?)').bind(SITE, name, body, status, reason, ip, now).run();
  if (reason) { const m = await notify(env, { name, body, reason }); if (m !== '보냄') await env.DB.prepare('UPDATE entries SET reason=? WHERE id=?').bind(reason + ' / ' + m, ins.meta.last_row_id).run(); }
  return json({ status });
}
