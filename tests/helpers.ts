import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Pet, Snapshot } from '../src/types';

export async function desktop(page: Page, pet: Pet = 'cat') {
  const state: Snapshot = {
    self: { id: 'self', pet, name: '我', city: pet === 'dog' ? 'zhuhai' : 'beijing', mood: '平静', availability: 'busy', plan: '', updatedAt: new Date().toISOString() },
    partner: { id: 'partner', pet: pet === 'dog' ? 'cat' : 'dog', name: '对方', city: pet === 'dog' ? 'beijing' : 'zhuhai', mood: '想你', availability: 'resting', plan: '', updatedAt: new Date().toISOString() },
    messages: [], serverTime: new Date().toISOString(),
  };
  await page.setViewportSize({ width: 390, height: 740 });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.addInitScript(({ state }) => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        invoke: async () => {},
      },
    });
    // Seed the old storage format once; reloads must keep real app persistence.
    if (!localStorage.getItem('pawbridge.v1')) localStorage.setItem('pawbridge.v1', JSON.stringify({
      session: { server: 'http://127.0.0.1:8789', token: 'test-only-token' }, snapshot: state, outbox: [],
    }));
  }, { state });
  await page.route('http://127.0.0.1:8789/api/sync', route => route.fulfill({ json: state }));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: { temperature_2m: 24, weather_code: 0 } } }));
  await page.goto('/');
  await expect(page.locator('#connection-text')).toContainText('已同步');
  return state;
}
