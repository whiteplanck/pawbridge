export type Pet = 'dog' | 'cat';
export type City = 'zhuhai' | 'beijing';
export type Availability = 'available' | 'busy' | 'resting';
export type GreetingKind = 'miss' | 'pat' | 'snack' | 'note';
export interface Profile {
  id: string;
  pet: Pet;
  name: string;
  city: City;
  mood: string;
  availability: Availability;
  plan: string;
  updatedAt: string;
}
export interface Letter { id: string; kind: GreetingKind; note: string; createdAt: string }
export interface Snapshot { self: Profile; partner: Profile | null; messages: Letter[]; serverTime: string }
export interface Invite { code: string; expiresAt: number }
export interface Session { server: string; token: string; invite?: Invite }
export interface PendingGreeting { requestId: string; kind: GreetingKind; note: string }
export const cities = { zhuhai: '珠海', beijing: '北京' };
export const availabilityLabels = { available: '有空，来找我吧', busy: '忙碌中', resting: '休息中' };
export const greetingLabels = { miss: '想你了', pat: '摸摸头', snack: '送零食', note: '小纸条' };
