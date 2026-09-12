import type { Session } from './types';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export function normalizeServer(input: string): string {
  const url = new URL(input.trim());
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('请输入 HTTPS 服务地址；本机调试可用 http://127.0.0.1:8787');
  }
  if (url.pathname !== '/') throw new Error('服务地址请使用域名根路径');
  return url.origin;
}
export async function request<T>(session: Pick<Session, 'server'> & Partial<Session>, path: string, payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${session.server}/api/${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  } catch { throw new ApiError('暂时连不上，对方的近况可能还没更新'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || '请求失败，请稍后重试', response.status);
  return data as T;
}
