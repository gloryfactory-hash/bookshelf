import { SITE, json, isAdmin, notify } from './_lib.js';
// 관리: GET 목록(보류·공개), POST { id, action: publish|remove|reply, reply, by }
export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: '관리 열쇠가 맞지 않아요.' }, 401);
  const { results } = await env.DB.prepare("SELECT id,name,body,status,reason,reply,reply_by,created_at FROM entries WHERE site=? AND status!='removed' ORDER BY status='held' DESC, created_at DESC LIMIT 200").bind(SITE).all();
  return json({ items: results });
}
export async function onRequestPost({ request, env }) {
  if (!isAdmin(request, env)) return json({ error: '관리 열쇠가 맞지 않아요.' }, 401);
  const d = await request.json().catch(() => ({})), id = Number(d.id);
  if (d.action === 'testmail') return json({ mail: await notify(env, { name: '시험', body: '알림 메일 시험이에요.', reason: '시험' }) });
  if (!id) return json({ error: '글 번호가 없어요.' }, 400);
  if (d.action === 'publish') await env.DB.prepare("UPDATE entries SET status='public' WHERE id=? AND site=?").bind(id, SITE).run();
  else if (d.action === 'remove') await env.DB.prepare("UPDATE entries SET status='removed' WHERE id=? AND site=?").bind(id, SITE).run();
  else if (d.action === 'reply') await env.DB.prepare('UPDATE entries SET reply=?, reply_by=? WHERE id=? AND site=?').bind(String(d.reply || '').trim().slice(0, 300) || null, d.by === '김민성' ? '김민성 작가' : '임지형 작가', id, SITE).run();
  else return json({ error: '알 수 없는 일이에요.' }, 400);
  return json({ ok: true });
}
