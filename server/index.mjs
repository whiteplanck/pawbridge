import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createStore } from './store.mjs';
import { createApp } from './app.mjs';

const host = process.env.HOST || '127.0.0.1';
const setupKey = process.env.PAWBRIDGE_SETUP_KEY || '';
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && setupKey.length < 24) {
  throw new Error('Public listening requires PAWBRIDGE_SETUP_KEY of at least 24 characters');
}
const path = resolve(process.env.DATABASE_PATH || './data/pawbridge.sqlite');
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const store = createStore(path);
const app = createApp({ store, setupKey, origins: process.env.ALLOWED_ORIGINS?.split(',').map(x => x.trim()).filter(Boolean) });
app.listen(Number(process.env.PORT || 8787), host, () => console.log(`PawBridge listening on ${host}:${app.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => { store.close(); process.exit(0); }));
