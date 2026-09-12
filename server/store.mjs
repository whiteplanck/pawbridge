import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const options = (value, allowed) => allowed.includes(value) ? value : fail(400, '选项不正确');
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '内容为空或过长');
  return value.trim();
}
const profile = ({ id, pet, name, city, mood, availability, plan, updated_at }) =>
  ({ id, pet, name, city, mood, availability, plan, updatedAt: updated_at });

export function createStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id),
      token_hash TEXT NOT NULL UNIQUE, pet TEXT NOT NULL,
      name TEXT NOT NULL, city TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '平静',
      availability TEXT NOT NULL DEFAULT 'available', plan TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL, UNIQUE(room_id, pet)
    );
    CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY, room_id TEXT NOT NULL UNIQUE REFERENCES rooms(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id),
      recipient_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
      kind TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL,
      read_at TEXT, UNIQUE(sender_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS inbox ON messages(recipient_id, read_at, created_at);
  `);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function addUser(roomId, pet, input) {
    const token = secret();
    const id = randomUUID();
    run('INSERT INTO users (id, room_id, token_hash, pet, name, city, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, roomId, hash(token), pet, text(input.name, 24, true),
      options(input.city, ['zhuhai', 'beijing']), new Date().toISOString());
    return { token };
  }
  function invite(roomId) {
    const code = randomBytes(6).toString('hex').toUpperCase();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    run('INSERT OR REPLACE INTO invites VALUES (?, ?, ?)', hash(code), roomId, expiresAt);
    return { code, expiresAt };
  }
  function partner(user) { return get('SELECT * FROM users WHERE room_id = ? AND id != ?', user.room_id, user.id); }
  function prune() {
    run('DELETE FROM invites WHERE expires_at < ?', Date.now());
    run('DELETE FROM messages WHERE created_at < ?', new Date(Date.now() - 30 * 86400000).toISOString());
  }
  return {
    close: () => db.close(),
    create(input) {
      return transaction(() => {
        const roomId = randomUUID();
        run('INSERT INTO rooms VALUES (?)', roomId);
        return { ...addUser(roomId, 'dog', input), invite: invite(roomId) };
      });
    },
    join(input) {
      return transaction(() => {
        const code = text(input.code, 32, true).replaceAll('-', '').replaceAll(' ', '').toUpperCase();
        const entry = get('SELECT * FROM invites WHERE code_hash = ? AND expires_at > ?', hash(code), Date.now());
        if (!entry) fail(400, '配对码无效或已过期，请让对方重新生成');
        const result = addUser(entry.room_id, 'cat', input);
        run('DELETE FROM invites WHERE room_id = ?', entry.room_id);
        return result;
      });
    },
    authenticate(token) {
      if (typeof token !== 'string' || token.length > 128) fail(401, '请重新配对');
      return get('SELECT * FROM users WHERE token_hash = ?', hash(token)) ?? fail(401, '身份已失效，请重新配对');
    },
    renewInvite(user) {
      if (partner(user)) fail(409, '你们已经配对成功');
      return invite(user.room_id);
    },
    sync(user) {
      prune();
      const other = partner(user);
      const messages = db.prepare('SELECT id, kind, note, created_at AS createdAt FROM messages WHERE recipient_id = ? AND read_at IS NULL ORDER BY created_at, id LIMIT 50').all(user.id);
      return { self: profile(user), partner: other ? profile(other) : null, messages, serverTime: new Date().toISOString() };
    },
    update(user, input) {
      run('UPDATE users SET mood = ?, availability = ?, plan = ?, updated_at = ? WHERE id = ?',
        options(input.mood, ['开心', '平静', '有点累', '低落', '想你']),
        options(input.availability, ['available', 'busy', 'resting']),
        text(input.plan, 240), new Date().toISOString(), user.id);
      return { ok: true };
    },
    send(user, input) {
      const other = partner(user);
      if (!other) fail(409, '等对方配对后，就能送出招呼啦');
      const requestId = text(input.requestId, 64, true);
      const kind = options(input.kind, ['miss', 'pat', 'snack', 'note']);
      const note = text(input.note, 160, kind === 'note');
      const existing = get('SELECT id FROM messages WHERE sender_id = ? AND request_id = ?', user.id, requestId);
      if (existing) return { id: existing.id };
      prune();
      const count = get('SELECT count(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL', other.id).n;
      if (count >= 200) fail(429, '信箱满了，等对方读完再寄吧');
      const id = randomUUID();
      run('INSERT INTO messages (id, sender_id, recipient_id, request_id, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, user.id, other.id, requestId, kind, note, new Date().toISOString());
      return { id };
    },
    acknowledge(user, input) {
      if (!Array.isArray(input.ids) || input.ids.length > 50 || input.ids.some(id => typeof id !== 'string' || id.length > 64)) fail(400, '消息列表不正确');
      transaction(() => {
        for (const id of input.ids) run('UPDATE messages SET read_at = ? WHERE id = ? AND recipient_id = ? AND read_at IS NULL', new Date().toISOString(), id, user.id);
      });
      return { ok: true };
    },
  };
}
