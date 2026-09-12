import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';
import { createApp } from './app.mjs';

const dog = { name: '小狗', city: 'zhuhai' };
const cat = { name: '小猫', city: 'beijing' };
function couple(store) {
  const first = store.create(dog);
  const second = store.join({ ...cat, code: first.invite.code });
  return [store.authenticate(first.token), store.authenticate(second.token)];
}
test('one-time pairing, renewal invalidates old code, profiles contain no credentials', () => {
  const store = createStore();
  try {
    const first = store.create(dog);
    const user = store.authenticate(first.token);
    const renewed = store.renewInvite(user);
    assert.throws(() => store.join({ ...cat, code: first.invite.code }), /配对码/);
    store.join({ ...cat, code: renewed.code.toLowerCase() });
    assert.throws(() => store.join({ ...cat, code: renewed.code }), /配对码/);
    assert.throws(() => store.renewInvite(user), /已经配对/);
    const state = store.sync(user);
    assert.equal(state.partner.pet, 'cat');
    assert.equal(state.partner.city, 'beijing');
    assert.equal('token_hash' in state.self, false);
    assert.throws(() => store.authenticate('wrong'), /失效/);
  } finally { store.close(); }
});
test('an expired invite cannot join a room', (t) => {
  const store = createStore();
  try {
    const first = store.create(dog);
    t.mock.method(Date, 'now', () => first.invite.expiresAt + 1);
    assert.throws(() => store.join({ ...cat, code: first.invite.code }), /过期/);
  } finally { t.mock.restoreAll(); store.close(); }
});
test('greetings survive restarts, retries are idempotent, rooms and acknowledgements are isolated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pawbridge-test-'));
  const path = join(dir, 'test.sqlite');
  let store = createStore(path);
  try {
    const [a, b] = couple(store);
    const [outsider] = couple(store);
    const payload = { requestId: 'test-1', kind: 'note', note: '<script>hello</script>' };
    const first = store.send(a, payload);
    assert.deepEqual(store.send(a, payload), first);
    assert.equal(store.sync(a).messages.length, 0);
    assert.equal(store.sync(outsider).messages.length, 0);
    store.acknowledge(outsider, { ids: [first.id] });
    store.close(); store = createStore(path);
    assert.equal(store.sync(b).messages.length, 1);
    assert.equal(store.sync(b).messages[0].note, payload.note);
    store.acknowledge(b, { ids: [first.id] });
    assert.equal(store.sync(b).messages.length, 0);
    assert.deepEqual(store.send(a, payload), first);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('invalid data cannot create half a pair; status and queue bounds are enforced', () => {
  const store = createStore();
  try {
    const first = store.create(dog);
    assert.throws(() => store.join({ ...cat, name: '', code: first.invite.code }), /内容/);
    const joined = store.join({ ...cat, code: first.invite.code });
    const a = store.authenticate(first.token), b = store.authenticate(joined.token);
    assert.throws(() => store.update(a, { mood: 'oops', availability: 'busy', plan: '' }), /选项/);
    assert.throws(() => store.update(a, { mood: '开心', availability: 'busy', plan: 'x'.repeat(241) }), /内容/);
    store.update(a, { mood: '想你', availability: 'busy', plan: '九点有空' });
    assert.equal(store.sync(b).partner.plan, '九点有空');
    for (let i = 0; i < 200; i++) store.send(a, { requestId: String(i), kind: 'miss', note: '' });
    assert.throws(() => store.send(a, { requestId: 'overflow', kind: 'miss', note: '' }), /信箱满/);
    const messages = store.sync(b).messages;
    assert.equal(messages.length, 50);
    store.acknowledge(b, { ids: messages.map(x => x.id) });
    assert.equal(store.sync(b).messages.length, 50);
  } finally { store.close(); }
});
test('HTTP authentication, setup key, CORS, malformed JSON, body limit and rate limit', async () => {
  const store = createStore();
  const app = createApp({ store, setupKey: 'test-setup-key' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (path, data, token) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(`${base}/api/sync`)).status, 401);
    assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    const cors = await fetch(`${base}/api/sync`, { method: 'OPTIONS', headers: { Origin: 'tauri://localhost' } });
    assert.equal(cors.status, 204);
    assert.equal(cors.headers.get('access-control-allow-origin'), 'tauri://localhost');
    assert.equal((await post('/api/create', dog)).status, 403);
    const created = await post('/api/create', { ...dog, setupKey: 'test-setup-key' });
    assert.equal(created.status, 201);
    const { token } = await created.json();
    assert.equal((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await post('/api/status', { plan: 'x'.repeat(5000) }, token)).status, 413);
    assert.equal((await post('/api/status', null, token)).status, 400);
    for (let i = 0; i < 12; i++) await post('/api/join', { ...cat, code: 'invalid' });
    assert.equal((await post('/api/join', { ...cat, code: 'invalid' })).status, 429);
  } finally { await new Promise(resolve => app.close(resolve)); store.close(); }
});
