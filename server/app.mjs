import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './store.mjs';

const defaultOrigins = ['http://127.0.0.1:1420', 'http://localhost:1420', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '请使用 JSON');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 4096) throw new HttpError(413, '内容过长');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'JSON 格式不正确'); }
}
function keyMatches(value, expected) {
  if (typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp({ store, setupKey = '', origins = defaultOrigins }) {
  // Use the socket address, never untrusted X-Forwarded-For. Behind a proxy the
  // shared IP budget is intentional: this service is designed for one couple.
  const buckets = new Map();
  function limit(req, authRoute) {
    const now = Date.now();
    for (const [key, item] of buckets) if (item.until <= now) buckets.delete(key);
    const key = `${req.socket.remoteAddress}:${authRoute ? 'auth' : 'api'}`;
    const bucket = buckets.get(key) ?? { count: 0, until: now + 60000 };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > (authRoute ? 12 : 240)) throw new HttpError(429, '操作太快了，请稍等一分钟');
  }
  return createServer({ requestTimeout: 10000, headersTimeout: 10000 }, async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const reply = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    try {
      if (origin && !origins.includes(origin)) throw new HttpError(403, '此来源未获允许');
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.writeHead(204); res.end(); return;
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/health' && req.method === 'GET') return reply(200, { ok: true });
      const authRoute = ['/api/create', '/api/join'].includes(path);
      limit(req, authRoute);
      if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, '不支持此操作');
      const input = req.method === 'POST' ? await body(req) : {};
      if (path === '/api/create' && req.method === 'POST') {
        if (setupKey && !keyMatches(input.setupKey, setupKey)) throw new HttpError(403, '建家密钥不正确');
        return reply(201, store.create(input));
      }
      if (path === '/api/join' && req.method === 'POST') return reply(201, store.join(input));
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      const user = store.authenticate(token);
      if (path === '/api/sync' && req.method === 'GET') return reply(200, store.sync(user));
      const routes = {
        '/api/status': () => store.update(user, input),
        '/api/invite': () => store.renewInvite(user),
        '/api/greetings': () => store.send(user, input),
        '/api/messages/ack': () => store.acknowledge(user, input),
      };
      if (req.method === 'POST' && routes[path]) return reply(200, routes[path]());
      throw new HttpError(404, '没有找到此接口');
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Request failed:', error.message);
      reply(error instanceof HttpError ? error.status : 500, error instanceof HttpError ? { error: error.message } : { error: '服务暂时出错，请稍后重试' });
    }
  });
}
