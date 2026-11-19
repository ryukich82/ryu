// 로컬 테스트용 서버 (메모리 저장소). 실행: npm run dev → http://localhost:8888
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApi, handle } from '../netlify/lib/core.mjs';

const mem = new Map();
const api = createApi({
  get: async k => (mem.has(k) ? JSON.parse(mem.get(k)) : null),
  set: async (k, v) => { mem.set(k, JSON.stringify(v)); },
});
const port = +process.env.PORT || 8888;

http.createServer(async (req, res) => {
  const url = `http://localhost:${port}${req.url}`;
  if (req.url.startsWith('/api/round')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handle(api, new Request(url, {
      method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(await readFile(new URL('../public/index.html', import.meta.url)));
}).listen(port, () => console.log(`http://localhost:${port}`));
