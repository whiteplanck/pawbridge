import { ApiError, normalizeServer, request } from './api';
import { parseInvitation } from './invitation';
import { petSvg } from './pet';
import type { Invite, Session } from './types';

interface Options {
  connected: (session: Session) => Promise<void>;
  notify: (message: string) => void;
  cancel?: () => void;
}

export function renderOnboarding(target: HTMLElement, { connected, notify, cancel }: Options): void {
  target.innerHTML = `<div class="welcome"><div class="friends">${petSvg('dog')}${petSvg('cat')}</div><h2>你的小猫，等你带回家。</h2><p>把对方发来的邀请口令贴在下面，<br>我们就能住进彼此的桌面。</p></div>
    <form id="join-form" class="stack">
      <label>你的小名<input name="name" maxlength="24" value="小猫" autocomplete="nickname" required /></label>
      <label>对方发来的邀请口令<textarea name="invitation" id="invitation-input" rows="3" maxlength="2048" placeholder="粘贴以 PB1. 开头的整段口令" spellcheck="false" required></textarea></label>
      <p class="hint" id="invitation-preview">小猫默认住在北京，连接信息会自动填好。</p>
      <button class="primary" type="submit">领养小猫</button>
    </form>
    ${cancel ? '<p class="hint">重新配对成功后，本机切换到新的小家；原小家的身份不会自动迁移。</p><button id="cancel-connect" class="secondary">返回现在的小家</button>' : ''}
    <details class="advanced-setup"><summary>建立小家或本机测试</summary>
      <p class="hint">由建立小家的一方配置。跨城市使用需要先准备在线同步服务。</p>
      <form id="pair-form" class="stack">
        <label>同步服务地址<input name="server" type="url" value="http://127.0.0.1:8787" required placeholder="https://你的服务域名" /></label>
        <div class="two-col"><label>你的昵称<input name="name" maxlength="24" placeholder="怎么称呼你" required /></label><label>所在城市<select name="city"><option value="zhuhai">珠海</option><option value="beijing">北京</option></select></label></div>
        <label>领养方式<select name="mode" id="mode"><option value="create">我是小狗 · 建立我们的小家</option><option value="join">我是小猫 · 手动配对</option></select></label>
        <label id="key-label">建家密钥<input name="setupKey" type="password" autocomplete="off" placeholder="本地测试可留空" /></label>
        <label id="code-label" hidden>对方的配对码<input name="code" maxlength="32" autocomplete="off" placeholder="12 位配对码" /></label>
        <button class="primary" type="submit">让我们住进桌面</button>
      </form>
    </details>`;

  const invitation = target.querySelector<HTMLTextAreaElement>('#invitation-input')!;
  invitation.addEventListener('input', () => {
    const preview = target.querySelector('#invitation-preview')!;
    try { preview.textContent = `将连接到 ${new URL(parseInvitation(invitation.value).server).host}`; }
    catch { preview.textContent = '请完整粘贴对方发来的邀请口令。'; }
  });

  // Disable both forms during pairing to prevent creating two identities at once.
  let connecting = false;
  async function submit(form: HTMLFormElement, join: boolean) {
    if (connecting) return;
    connecting = true;
    const buttons = target.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      const data = Object.fromEntries(new FormData(form));
      let server: string;
      let result: { token: string; invite?: Invite };
      if (join) {
        const invite = parseInvitation(String(data.invitation));
        server = invite.server;
        result = await request({ server }, 'join', { code: invite.code, name: data.name, city: 'beijing' });
      } else {
        server = normalizeServer(String(data.server));
        result = await request({ server }, data.mode === 'join' ? 'join' : 'create', data);
      }
      await connected({ server, ...result });
    } catch (error) {
      notify(error instanceof ApiError && error.status === 0
        ? '小家暂时连不上，请让对方确认同步服务已启动，再试一次。邀请口令还在这里。'
        : (error as Error).message);
    }
    finally { connecting = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  for (const [id, join] of [['join-form', true], ['pair-form', false]] as const) {
    target.querySelector(`#${id}`)!.addEventListener('submit', event => {
      event.preventDefault();
      void submit(event.currentTarget as HTMLFormElement, join);
    });
  }
  target.querySelector('#mode')!.addEventListener('change', event => {
    const join = (event.target as HTMLSelectElement).value === 'join';
    target.querySelector<HTMLElement>('#code-label')!.hidden = !join;
    target.querySelector<HTMLElement>('#key-label')!.hidden = join;
    target.querySelector<HTMLSelectElement>('[name="city"]')!.value = join ? 'beijing' : 'zhuhai';
  });
  target.querySelector('#cancel-connect')?.addEventListener('click', () => cancel?.());
}
