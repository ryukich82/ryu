// 라운드 공유 서버 로직 (저장소는 주입: get(key) / set(key, value))
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const N = 4, H = 18;
const rid = () => randomBytes(9).toString('base64url');        // 라운드 ID (추측 불가)
const secret = () => randomBytes(18).toString('base64url');    // 접근 키

export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  return d;
}
const hashPhone = (salt, p) => {
  const d = normPhone(p);
  return d.length >= 9 ? createHash('sha256').update(salt + ':' + d).digest('hex') : '';
};
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const int = (v, lo, hi, d = 0) => { v = parseInt(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const str = (v, max) => String(v ?? '').slice(0, max);

function cleanMeta(m = {}) {
  const par = Array.from({ length: H }, (_, k) => [3, 4, 5].includes(+m.par?.[k]) ? +m.par[k] : 4);
  return {
    course: str(m.course, 40),
    date: str(m.date, 10),
    base: int(m.base, 0, 10_000_000, 1000),
    names: Array.from({ length: N }, (_, i) => str(m.names?.[i], 8)),
    par,
    override: Array.from({ length: H }, (_, k) => ['auto', 'base', 'double'].includes(m.override?.[k]) ? m.override[k] : 'auto'),
    extra: Array.from({ length: N }, (_, i) => int(m.extra?.[i], -100_000_000, 100_000_000, 0)),
  };
}
const cleanRow = r => Array.from({ length: H }, (_, k) => int(r?.[k], -3, 10, 0));

const K = {
  auth: id => `r/${id}/auth`,
  meta: id => `r/${id}/meta`,
  row: (id, i) => `r/${id}/s${i}`,
};

export function createApi(store) {
  async function load(id) {
    const [meta, ...rows] = await Promise.all([store.get(K.meta(id)), ...[0, 1, 2, 3].map(i => store.get(K.row(id, i)))]);
    if (!meta) return null;
    return { meta, scores: rows.map(r => cleanRow(r?.s)), stamp: Math.max(meta.t || 0, ...rows.map(r => r?.t || 0)) };
  }
  async function who(id, key) {
    if (!key) return null;
    const auth = await store.get(K.auth(id));
    if (!auth) return null;
    if (same(key, auth.host)) return { role: 'host', auth };
    const i = auth.tokens.findIndex(t => same(key, t));
    return i >= 0 ? { role: 'player', i, auth } : null;
  }

  return {
    async create(body) {
      const id = rid();
      const auth = { host: secret(), tokens: [0, 1, 2, 3].map(secret), salt: secret(), phones: [] };
      auth.phones = Array.from({ length: N }, (_, i) => hashPhone(auth.salt, body?.phones?.[i]));
      const t = Date.now();
      await store.set(K.auth(id), auth);
      await Promise.all([0, 1, 2, 3].map(i => store.set(K.row(id, i), { s: cleanRow(body?.scores?.[i]), t })));
      await store.set(K.meta(id), { ...cleanMeta(body?.meta), t });
      return { status: 200, body: { id, hostKey: auth.host, tokens: auth.tokens, state: await load(id) } };
    },

    async get(id, key) {
      const state = await load(id);
      if (!state) return { status: 404, body: { error: '라운드를 찾을 수 없습니다.' } };
      const w = await who(id, key);
      return { status: 200, body: { state, role: w?.role || 'viewer', i: w?.i ?? null } };
    },

    async join(id, phone) {
      const auth = await store.get(K.auth(id));
      const h = auth && hashPhone(auth.salt, phone);
      const i = h ? auth.phones.findIndex(p => p && same(p, h)) : -1;
      if (i < 0) return { status: 403, body: { error: '등록된 번호가 아닙니다. 번호를 확인하거나 주최자에게 문의하세요.' } };
      return { status: 200, body: { token: auth.tokens[i], i } };
    },

    async op(id, key, op) {
      const w = await who(id, key);
      if (!w) return { status: 401, body: { error: '권한이 없습니다. 링크를 다시 받아 주세요.' } };
      const t = Date.now();
      switch (op?.type) {
        case 'score': {
          const i = int(op.i, 0, N - 1), h = int(op.h, 0, H - 1);
          if (w.role === 'player' && w.i !== i) return { status: 403, body: { error: '본인 스코어만 입력할 수 있습니다.' } };
          const row = cleanRow((await store.get(K.row(id, i)))?.s);
          row[h] = int(op.v, -3, 10, 0);
          await store.set(K.row(id, i), { s: row, t });
          break;
        }
        case 'meta':
          if (w.role !== 'host') return { status: 403, body: { error: '주최자만 변경할 수 있습니다.' } };
          await store.set(K.meta(id), { ...cleanMeta(op.meta), t });
          break;
        case 'phones':
          if (w.role !== 'host') return { status: 403, body: { error: '주최자만 변경할 수 있습니다.' } };
          w.auth.phones = Array.from({ length: N }, (_, i) => hashPhone(w.auth.salt, op.phones?.[i]));
          await store.set(K.auth(id), w.auth);
          break;
        case 'reset':
          if (w.role !== 'host') return { status: 403, body: { error: '주최자만 변경할 수 있습니다.' } };
          await Promise.all([0, 1, 2, 3].map(i => store.set(K.row(id, i), { s: cleanRow([]), t })));
          await store.set(K.meta(id), { ...cleanMeta(op.meta), t });
          break;
        default:
          return { status: 400, body: { error: '알 수 없는 요청입니다.' } };
      }
      return { status: 200, body: { state: await load(id), role: w.role, i: w.i ?? null } };
    },
  };
}

// fetch Request → 응답 (Netlify Function / 로컬 개발 서버 공용)
export async function handle(api, req) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/round\/?/, '').split('/').filter(Boolean);
  const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const json = (r) => new Response(JSON.stringify(r.body), {
    status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  let body = null;
  if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
  try {
    const [id, action] = parts;
    if (id && !/^[\w-]{6,40}$/.test(id)) return json({ status: 404, body: { error: '잘못된 라운드입니다.' } });
    if (!id && req.method === 'POST') return json(await api.create(body));
    if (id && !action && req.method === 'GET') return json(await api.get(id, key));
    if (id && action === 'join' && req.method === 'POST') return json(await api.join(id, body?.phone));
    if (id && action === 'op' && req.method === 'POST') return json(await api.op(id, key, body));
    return json({ status: 404, body: { error: 'not found' } });
  } catch (e) {
    console.error(e);
    return json({ status: 500, body: { error: '서버 오류가 발생했습니다.' } });
  }
}
