import './style.css';
import { ApiError, normalizeServer, request } from './api';
import { desktop, drag, quit, resize } from './desktop';
import { petSvg } from './pet';
import { load, save } from './storage';
import { weather } from './weather';
import { availabilityLabels, cities, greetingLabels } from './types';
import type { GreetingKind, Invite, PendingGreeting, Session, Snapshot } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const saved = load();
let session: Session | undefined = saved?.session;
let snapshot: Snapshot | undefined = saved?.snapshot;
let outbox: PendingGreeting[] = saved?.outbox ?? [];
let expanded = true;
let syncing = false;
let timer: ReturnType<typeof setTimeout>;
let failures = 0;
let currentTab = 'partner';
let online = false;
let statusDirty = false;
let pendingRender = false;
const animated = new Set<string>();
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
const day = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
function persist() {
  if (session) save({ session, snapshot, outbox });
}
function toast(message: string) {
  const target = document.querySelector<HTMLElement>('#toast');
  if (target) { target.textContent = message; target.classList.add('visible'); }
}
function on(id: string, action: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', () => {
    Promise.resolve().then(action).catch(error => toast(error.message));
  });
}
function mount() {
  document.body.classList.toggle('desktop', desktop);
  app.innerHTML = `<main class="shell">
    <section class="panel" id="panel">
      <header><div><span class="eyebrow">PAWBRIDGE</span><h1>爪爪来信<span class="brand-dot">✦</span></h1></div><div class="window-actions"><button id="collapse" title="收起成桌宠" aria-label="收起成桌宠">−</button>${desktop ? '<button id="quit" title="退出" aria-label="退出">×</button>' : ''}</div></header>
      <div id="content"></div>
      <p id="toast" class="toast" role="status" aria-live="polite"></p>
      <footer>两座城市，一个小小的日常。</footer>
    </section>
    <div class="pet-dock"><span id="bubble" class="bubble">点点我，看看对方</span><button class="pet-button" id="pet" aria-label="打开或收起桌宠">${petSvg(snapshot?.self.pet ?? 'dog')}</button><button id="move" class="move" aria-label="拖动桌宠" title="按住拖动">⠿</button><span class="badge" id="badge" hidden></span></div>
  </main>`;
  on('collapse', toggle);
  on('pet', toggle);
  on('quit', quit);
  document.getElementById('move')?.addEventListener('pointerdown', () => { void drag().catch(error => toast(error.message)); });
  document.querySelector('header')?.addEventListener('pointerdown', event => {
    if (!(event.target as HTMLElement).closest('button')) void drag().catch(error => toast(error.message));
  });
  if (session) home(); else onboarding();
}
async function toggle() {
  expanded = !expanded;
  document.querySelector('.shell')?.classList.toggle('compact', !expanded);
  try { await resize(expanded); } catch (error) { toast((error as Error).message); }
}
function onboarding() {
  document.getElementById('content')!.innerHTML = `<div class="welcome"><div class="friends">${petSvg('dog')}${petSvg('cat')}</div><h2>把想念，放在桌面上。</h2><p>你的小狗，她的小猫。<br>隔着城市，也能轻轻碰个面。</p></div>
    <form id="pair-form" class="stack">
      <label>同步服务地址<input name="server" type="url" value="http://127.0.0.1:8787" required placeholder="https://你的服务域名" /></label>
      <div class="two-col"><label>你的昵称<input name="name" maxlength="24" placeholder="怎么称呼你" required /></label><label>所在城市<select name="city"><option value="zhuhai">珠海</option><option value="beijing">北京</option></select></label></div>
      <label>领养方式<select name="mode" id="mode"><option value="create">我是小狗 · 建立我们的小家</option><option value="join">我是小猫 · 用配对码加入</option></select></label>
      <label id="key-label">建家密钥<input name="setupKey" type="password" autocomplete="off" placeholder="本地测试可留空" /></label>
      <label id="code-label" hidden>对方的配对码<input name="code" maxlength="32" autocomplete="off" placeholder="12 位配对码" /></label>
      <button class="primary" type="submit">让我们住进桌面</button><p class="hint">第一次使用需先启动同步服务。两个人填写相同的服务地址。</p>
    </form>`;
  document.getElementById('mode')!.addEventListener('change', event => {
    const join = (event.target as HTMLSelectElement).value === 'join';
    document.getElementById('code-label')!.hidden = !join;
    document.getElementById('key-label')!.hidden = join;
    (document.querySelector('[name="city"]') as HTMLSelectElement).value = join ? 'beijing' : 'zhuhai';
  });
  document.getElementById('pair-form')!.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      const server = normalizeServer(data.server as string);
      const result = await request<{ token: string; invite?: Invite }>({ server }, data.mode === 'join' ? 'join' : 'create', data);
      session = { server, ...result };
      persist();
      home();
      await sync();
    } catch (error) { toast((error as Error).message); }
    finally { button.disabled = false; }
  });
}
function home() {
  document.getElementById('content')!.innerHTML = `<div class="connection"><span id="connection-dot"></span><span id="connection-text">正在连接我们的小家…</span><button id="refresh" class="text-button">刷新</button></div>
    <nav aria-label="桌宠面板"><button id="tab-partner" class="active">对方的日常</button><button id="tab-self">我的今天</button><button id="tab-inbox">小信箱 <span id="inbox-count"></span></button></nav>
    <div id="tab-content"></div><div class="outbox" id="outbox"></div>`;
  for (const tab of ['partner', 'self', 'inbox']) on(`tab-${tab}`, () => {
    if (currentTab === 'self' && statusDirty && !window.confirm('还有未分享的修改，确定离开这一页吗？')) return;
    statusDirty = false;
    currentTab = tab;
    renderTab();
  });
  on('refresh', sync);
  renderTab();
}
function renderTab() {
  const target = document.getElementById('tab-content');
  if (!target) return;
  for (const tab of ['partner', 'self', 'inbox']) document.getElementById(`tab-${tab}`)?.classList.toggle('active', tab === currentTab);
  if (!snapshot) {
    target.innerHTML = '<div class="empty">正在等桌宠带回消息…<p>如果服务暂时离线，可以稍后点击刷新。</p></div>';
    return;
  }
  if (currentTab === 'partner') renderPartner(target);
  if (currentTab === 'self') renderSelf(target);
  if (currentTab === 'inbox') renderInbox(target);
}
function renderPartner(target: HTMLElement) {
  const partner = snapshot!.partner;
  if (!partner) {
    target.innerHTML = `<div class="empty"><span class="letter-icon">✉</span><h2>给另一座城市，留个位置。</h2><p>把配对码告诉她，让小猫来住。</p><code id="invite-code">${escape(session?.invite?.code ?? '尚未生成')}</code><p class="hint">配对码 24 小时内有效，只能用一次。</p><button id="renew" class="secondary">重新生成配对码</button></div>`;
    on('renew', async () => { session!.invite = await request<Invite>(session!, 'invite', {}); persist(); renderTab(); });
    return;
  }
  const today = day(partner.updatedAt) === day(snapshot!.serverTime);
  target.innerHTML = `<article class="partner-card"><div class="partner-top"><div><span class="eyebrow">来自 ${cities[partner.city]} 的日常</span><h2>${escape(partner.name)}</h2></div><div class="mini-pet">${petSvg(partner.pet)}</div></div>
    <div class="chips"><span>${escape(partner.mood)}</span><span class="availability ${partner.availability}">${availabilityLabels[partner.availability]}</span></div>
    <p class="weather" id="weather">正在看看那边的天气…</p><div class="plan"><span class="eyebrow">${today ? '今天的计划' : '上次分享的计划'}</span><p>${escape(partner.plan || '还没有写计划，平平常常的一天也很好。')}</p></div>
    <p class="updated">${time(partner.updatedAt)} 主动分享${today ? '' : ' · 非今日状态'}</p></article>
    <div class="greetings"><button id="send-miss">♡<span>想你了</span></button><button id="send-pat">✿<span>摸摸头</span></button><button id="send-snack">♧<span>送零食</span></button></div>
    <form id="note-form" class="note-form"><input aria-label="小纸条内容" name="note" maxlength="160" placeholder="留张小纸条，等你有空看…" required /><button type="submit" aria-label="寄出小纸条">↗</button></form><p class="hint">忙碌或休息时，招呼会安静留在信箱里。</p>
    <p class="weather-credit">天气数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 城市天气，非实时定位</p>`;
  void weather(partner.city).then(value => { const el = document.getElementById('weather'); if (el && snapshot?.partner?.city === partner.city) el.textContent = `${cities[partner.city]} · ${value}`; });
  for (const kind of ['miss', 'pat', 'snack'] as GreetingKind[]) on(`send-${kind}`, () => send(kind, ''));
  document.getElementById('note-form')!.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const note = String(new FormData(form).get('note') || '').trim();
    if (note) void send('note', note).then(() => form.reset()).catch(error => toast(error.message));
  });
}
function renderSelf(target: HTMLElement) {
  const self = snapshot!.self;
  target.innerHTML = `<form id="status-form" class="stack self-form"><h2>今天的你，怎么样？</h2><p class="hint">只有点击分享，对方才会看到更新。</p><label>我的心情<select name="mood">${['开心', '平静', '有点累', '低落', '想你'].map(value => `<option ${self.mood === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    <label>现在的状态<select name="availability">${Object.entries(availabilityLabels).map(([value, label]) => `<option value="${value}" ${self.availability === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>今日计划<textarea name="plan" maxlength="240" rows="4" placeholder="下午忙工作，晚上九点一起打电话。">${escape(self.plan)}</textarea></label><button class="primary" type="submit">分享给对方</button><p class="hint">${time(self.updatedAt)} 更新 · ${cities[self.city]}</p></form>`;
  const form = document.getElementById('status-form') as HTMLFormElement;
  form.addEventListener('input', () => { statusDirty = true; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      await request(session!, 'status', Object.fromEntries(new FormData(form)));
      statusDirty = false;
      toast('今天的你，已经分享给对方了');
      await sync();
    } catch (error) { toast(`${(error as Error).message}；修改还在这里，联网后请再分享一次`); }
    finally { button.disabled = false; }
  });
}
function renderInbox(target: HTMLElement) {
  const letters = snapshot!.messages;
  target.innerHTML = `<div class="inbox-header"><h2>想念都有回音</h2>${letters.length ? '<button id="ack" class="text-button">这些都读过啦</button>' : ''}</div>${letters.length ? `<div class="letters">${letters.map(letter => `<article class="letter"><strong>${greetingLabels[letter.kind]}</strong><p>${escape(letter.note || ({ miss: '隔着屏幕，也想贴贴你。', pat: '今天辛苦啦，摸摸头。', snack: '给你送来一份小零食。', note: '' })[letter.kind])}</p><time>${time(letter.createdAt)}</time></article>`).join('')}</div>` : '<div class="empty"><span class="letter-icon">♡</span><p>信箱空空，想念满满。<br>收到的小纸条会出现在这里。</p></div>'}<p class="hint">未读消息保留 30 天；点击已读后收起。每次最多显示 50 条。</p>`;
  on('ack', async () => {
    await request(session!, 'messages/ack', { ids: letters.map(letter => letter.id) });
    await sync();
  });
}
function indicators() {
  const count = snapshot?.messages.length ?? 0;
  const badge = document.getElementById('badge')!;
  badge.hidden = count === 0;
  badge.textContent = `${count}${count === 50 ? '+' : ''}`;
  const inboxCount = document.getElementById('inbox-count');
  if (inboxCount) inboxCount.textContent = count ? `(${count})` : '';
  const connection = document.getElementById('connection-text');
  if (connection) connection.textContent = online ? '已同步 · 状态由对方主动分享' : '连接中断 · 显示上次收到的近况';
  document.getElementById('connection-dot')?.classList.toggle('online', online);
  const queue = document.getElementById('outbox');
  if (queue) {
    queue.replaceChildren();
    if (outbox.length) {
      queue.append(`待寄出 ${outbox.length} 条，联网后自动重试。`);
      const button = document.createElement('button');
      button.className = 'text-button'; button.textContent = '取消待寄';
      button.onclick = () => {
        if (window.confirm('取消所有尚未确认寄出的招呼？已到达服务端的消息无法撤回。')) { outbox = []; persist(); indicators(); }
      };
      queue.append(button);
    }
  }
}
async function send(kind: GreetingKind, note: string) {
  if (outbox.length >= 20) throw new Error('待寄消息已满，先等网络恢复吧');
  outbox.push({ kind, note, requestId: crypto.randomUUID() });
  persist();
  toast('已经放进待寄信箱');
  indicators();
  await sync();
}
async function sync() {
  if (!session || syncing) return;
  syncing = true;
  clearTimeout(timer);
  try {
    let deliveryError: Error | undefined;
    // Stable request IDs make retries safe even when a response is lost.
    while (outbox.length) {
      const item = outbox[0];
      try { await request(session, 'greetings', item); }
      catch (error) { deliveryError = error as Error; break; }
      outbox = outbox.filter(message => message.requestId !== item.requestId);
      persist();
      toast('桌宠已经把招呼寄出啦');
    }
    const next = await request<Snapshot>(session, 'sync');
    const changed = !snapshot || day(next.serverTime) !== day(snapshot.serverTime)
      || JSON.stringify([next.partner, next.messages]) !== JSON.stringify([snapshot.partner, snapshot.messages]);
    const wasMissing = !snapshot;
    snapshot = next;
    if (next.partner) delete session.invite;
    persist();
    online = true;
    failures = 0;
    document.getElementById('pet')!.innerHTML = petSvg(next.self.pet);
    pendingRender ||= changed;
    if (wasMissing || (pendingRender && currentTab !== 'self' && !(document.activeElement instanceof HTMLInputElement))) {
      renderTab();
      pendingRender = false;
    }
    if (next.partner && currentTab === 'partner') {
      const city = next.partner.city;
      void weather(city).then(value => {
        const el = document.getElementById('weather');
        if (el && snapshot?.partner?.city === city) el.textContent = `${cities[city]} · ${value}`;
      });
    }
    const unreadIds = new Set(next.messages.map(letter => letter.id));
    for (const id of animated) if (!unreadIds.has(id)) animated.delete(id);
    if (next.self.availability === 'available') {
      const fresh = next.messages.filter(letter => !animated.has(letter.id));
      if (fresh.length) {
        next.messages.forEach(letter => animated.add(letter.id));
        document.getElementById('bubble')!.textContent = `${next.partner?.name ?? '对方'}的${greetingLabels[fresh[0].kind]}到了 ♡`;
        document.querySelector('.pet-dock')?.classList.add('greet');
        setTimeout(() => document.querySelector('.pet-dock')?.classList.remove('greet'), 5000);
      }
    }
    if (deliveryError) toast(`近况已同步，招呼待寄：${deliveryError.message}`);
  } catch (error) {
    online = false;
    failures += 1;
    if (error instanceof ApiError && error.status === 401) toast('本机身份已失效；请按 README 的身份恢复说明处理');
    else toast((error as Error).message);
  } finally {
    syncing = false;
    indicators();
    timer = setTimeout(() => void sync(), Math.min(60000, 15000 * 2 ** Math.min(failures, 2)));
  }
}
mount();
if (session) void sync();
window.addEventListener('online', () => void sync());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
