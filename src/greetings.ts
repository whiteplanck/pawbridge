import { petSvg } from './pet';
import { decodeInteraction } from './interactions';
import type { GreetingKind, Pet } from './types';

interface Cue { id: string; kind: GreetingKind; note: string; visitor: Pet; name: string }

// Only visual cues are bounded; messages remain in the existing durable inbox.
const maxCues = 5;
const visitDuration = 5600;
const greetingDuration = 3000;

export function createGreetingPlayer(dock: HTMLElement) {
  const bubble = dock.querySelector<HTMLElement>('.bubble')!;
  const visitor = document.createElement('div');
  visitor.className = 'visitor';
  visitor.setAttribute('aria-hidden', 'true');
  const heart = document.createElement('span');
  heart.className = 'visit-heart';
  heart.setAttribute('aria-hidden', 'true');
  heart.textContent = '♥';
  visitor.hidden = heart.hidden = true;
  dock.append(visitor, heart);

  const queue: Cue[] = [];
  let active: Cue | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reset() {
    dock.classList.remove('visiting', 'greet', 'gentle-greeting');
    visitor.hidden = heart.hidden = true;
    visitor.replaceChildren();
    delete dock.dataset.greetingId;
    delete dock.dataset.interaction;
    active = undefined;
  }
  function playNext() {
    if (active || !queue.length) return;
    active = queue.shift()!;
    const action = decodeInteraction(active);
    const visiting = action.visit;
    const gentle = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = gentle ? 2400 : visiting ? visitDuration : greetingDuration;
    dock.style.setProperty('--greeting-duration', `${duration}ms`);
    dock.dataset.greetingId = active.id;
    dock.dataset.interaction = action.id;
    bubble.textContent = `${active.name}：${action.text || action.label}`;
    heart.textContent = action.icon;
    heart.hidden = action.id === 'note';
    if (visiting) {
      visitor.innerHTML = petSvg(active.visitor);
      visitor.hidden = false;
    }
    // Restart CSS animations even when two consecutive cues have the same kind.
    void dock.offsetWidth;
    dock.classList.toggle('gentle-greeting', gentle);
    dock.classList.add(visiting ? 'visiting' : 'greet');
    timer = setTimeout(() => {
      timer = undefined;
      reset();
      if (!queue.length) bubble.textContent = '点点我，看看对方';
      playNext();
    }, duration);
  }

  return {
    enqueue(cues: Cue[]) {
      for (const cue of cues) {
        if (queue.length + (active ? 1 : 0) >= maxCues) break;
        if (cue.id === active?.id || queue.some(item => item.id === cue.id)) continue;
        queue.push(cue);
      }
      playNext();
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
      queue.length = 0;
      reset();
      bubble.textContent = '点点我，看看对方';
    },
  };
}
