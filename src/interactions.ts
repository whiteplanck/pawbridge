import type { GreetingKind, Letter } from './types';

export const interactions = [
  { id: 'miss', label: '想你了', icon: '♡', kind: 'miss', visit: true, text: '来串门啦，隔着屏幕也想贴贴你。' },
  { id: 'pat', label: '摸摸头', icon: '✿', kind: 'pat', visit: false, text: '今天辛苦啦，摸摸头。' },
  { id: 'snack', label: '送零食', icon: '♧', kind: 'snack', visit: false, text: '给你送来一份小零食，记得好好吃饭。' },
  { id: 'hug', label: '抱抱', icon: '♥', kind: 'note', visit: true, text: '先抱一下，今天的烦恼晚点再说。' },
  { id: 'kiss', label: '亲亲', icon: '♡', kind: 'note', visit: true, text: '啵！偷偷给你一个亲亲。' },
  { id: 'cheer', label: '加油', icon: '★', kind: 'note', visit: false, text: '我在这边给你加油，你已经很棒啦！' },
  { id: 'morning', label: '早安', icon: '☀', kind: 'note', visit: false, text: '早安呀，新的一天也想和你一起过。' },
  { id: 'night', label: '晚安', icon: '☾', kind: 'note', visit: false, text: '今天辛苦啦，晚安，梦里见。' },
  { id: 'water', label: '喝水提醒', icon: '💧', kind: 'note', visit: false, text: '喝口水、伸个懒腰，照顾好自己呀。' },
] as const;

export type InteractionId = typeof interactions[number]['id'];
export type InteractionDrafts = Partial<Record<InteractionId, string>>;
export const isInteraction = (id: unknown): id is InteractionId => interactions.some(item => item.id === id);
export const interaction = (id: InteractionId) => interactions.find(item => item.id === id)!;

// A readable title keeps the existing 160-character note API and old clients
// compatible. Only exact reserved titles at the start of a note imply an action.
const prefix = (id: InteractionId) => {
  const item = interaction(id);
  return item.kind === 'note' ? `【互动：${item.label}】\n` : '';
};
export const interactionTextLimit = (id: InteractionId) => 160 - prefix(id).length;

export function encodeInteraction(id: InteractionId, input: string): { kind: GreetingKind; note: string } {
  const item = interaction(id);
  const text = input.trim() || item.text;
  if (text.length > interactionTextLimit(id)) throw new Error('互动文字太长了，请缩短一点再发送');
  return { kind: item.kind, note: prefix(id) + text };
}

export function decodeInteraction(letter: Pick<Letter, 'kind' | 'note'>) {
  const item = interactions.find(item => item.kind !== 'note' ? item.kind === letter.kind
    : letter.kind === 'note' && letter.note.startsWith(prefix(item.id)));
  if (!item) return { id: 'note' as const, label: '小纸条', icon: '✉', visit: false, text: letter.note };
  return { id: item.id, label: item.label, icon: item.icon, visit: item.visit,
    text: letter.note.slice(prefix(item.id).length) || item.text };
}

export function readInteractionDrafts(value: unknown): InteractionDrafts {
  const drafts: InteractionDrafts = {};
  if (!value || typeof value !== 'object') return drafts;
  for (const { id } of interactions) {
    const text = Reflect.get(value, id);
    if (typeof text === 'string' && text.length <= interactionTextLimit(id)) drafts[id] = text;
  }
  return drafts;
}
