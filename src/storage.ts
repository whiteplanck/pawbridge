import type { PendingGreeting, Session, Snapshot } from './types';
interface Saved { session: Session; snapshot?: Snapshot; outbox: PendingGreeting[]; announcedMessages?: string[] }
const key = 'pawbridge.v1';
export function load(): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value || typeof value.session?.server !== 'string' || typeof value.session?.token !== 'string') return null;
    return { ...value, outbox: Array.isArray(value.outbox) ? value.outbox : [],
      announcedMessages: Array.isArray(value.announcedMessages)
        ? value.announcedMessages.filter((id: unknown) => typeof id === 'string' && id.length <= 64).slice(-200) : [] };
  } catch { return null; }
}
export function save(value: Saved): void { localStorage.setItem(key, JSON.stringify(value)); }
