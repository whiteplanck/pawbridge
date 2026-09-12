import { interaction, interactions, interactionTextLimit } from './interactions';
import type { InteractionDrafts, InteractionId } from './interactions';

interface Options {
  selected: InteractionId;
  drafts: InteractionDrafts;
  changed: (id: InteractionId, text: string) => void;
  send: (id: InteractionId, text: string) => Promise<void>;
  notify: (text: string) => void;
}

export function renderInteractionComposer(target: HTMLElement, options: Options) {
  let selected = options.selected;
  const drafts = { ...options.drafts };
  target.innerHTML = `<form id="interaction-form" class="stack interaction-composer">
    <h2>今天想怎么陪你？</h2>
    <div class="interaction-grid" role="group" aria-label="互动类别">${interactions.map(item =>
      `<button type="button" data-interaction="${item.id}" aria-pressed="false"><span aria-hidden="true">${item.icon}</span>${item.label}</button>`).join('')}</div>
    <label>互动文字<textarea id="interaction-note" rows="2" aria-describedby="interaction-help interaction-count"></textarea></label>
    <div class="interaction-tools"><button id="interaction-reset" class="text-button" type="button">恢复默认文字</button><span id="interaction-count" class="hint"></span></div>
    <p id="interaction-help" class="hint">文字记在本机，点发送才发出；留空用默认文字。</p>
    <button id="interaction-send" type="submit" class="primary"></button>
  </form>`;
  const field = target.querySelector<HTMLTextAreaElement>('#interaction-note')!;
  const submit = target.querySelector<HTMLButtonElement>('#interaction-send')!;
  const count = target.querySelector<HTMLElement>('#interaction-count')!;
  function updateCount() {
    count.textContent = `${field.value.length} / ${interactionTextLimit(selected)}`;
  }
  function choose(id: InteractionId) {
    selected = id;
    field.maxLength = interactionTextLimit(id);
    field.value = drafts[id] ?? interaction(id).text;
    submit.textContent = `发送「${interaction(id).label}」`;
    for (const button of target.querySelectorAll<HTMLButtonElement>('[data-interaction]')) {
      button.setAttribute('aria-pressed', String(button.dataset.interaction === id));
    }
    updateCount();
  }
  function remember() {
    drafts[selected] = field.value;
    options.changed(selected, field.value);
    updateCount();
  }
  for (const item of interactions) {
    target.querySelector(`[data-interaction="${item.id}"]`)!.addEventListener('click', () => {
      choose(item.id);
      remember();
    });
  }
  field.addEventListener('input', remember);
  target.querySelector('#interaction-reset')!.addEventListener('click', () => {
    field.value = interaction(selected).text;
    remember();
  });
  target.querySelector('#interaction-form')!.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try { await options.send(selected, field.value); }
    catch (error) { options.notify((error as Error).message); }
    finally { submit.disabled = false; }
  });
  choose(selected);
}
