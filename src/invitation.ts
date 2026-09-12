import { normalizeServer } from './api';

interface Invitation { v: 1; server: string; code: string }
const prefix = 'PB1.';

function validate(value: unknown): Invitation {
  const data = value as Partial<Invitation> | null;
  if (!data || data.v !== 1 || typeof data.server !== 'string' || typeof data.code !== 'string' || !/^[A-F0-9]{12}$/.test(data.code)) {
    throw new Error('邀请口令不完整，请让对方重新复制整段口令');
  }
  const server = normalizeServer(data.server);
  if (!server.startsWith('https://')) throw new Error('本机测试地址不能邀请异地的她，请先配置在线同步服务');
  return { v: 1, server, code: data.code };
}

// An invitation contains the endpoint and one-time code, never an identity token.
export function createInvitation(server: string, code: string): string {
  const data = validate({ v: 1, server, code });
  return prefix + btoa(JSON.stringify(data)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function parseInvitation(input: string): Invitation {
  const value = input.trim();
  if (value.length > 2048 || !/^PB1\.[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('请粘贴以 PB1. 开头的完整邀请口令，不是旧版的 12 位配对码');
  }
  let data: unknown;
  try { data = JSON.parse(atob(value.slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/'))); }
  catch { throw new Error('邀请口令不完整，请让对方重新复制整段口令'); }
  return validate(data);
}
