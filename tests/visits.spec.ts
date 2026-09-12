import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Letter, Pet, Snapshot } from '../src/types';

const letter = (id: string, kind: Letter['kind'] = 'miss'): Letter => ({
  id, kind, note: '', createdAt: new Date().toISOString(),
});

async function desktop(page: Page, pet: Pet = 'cat') {
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
    // Seed the previous version's storage format only once, preserving reloads.
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

for (const pet of ['dog', 'cat'] as const) {
  test(`${pet} receives the opposite pet visiting in the compact transparent window`, async ({ page }) => {
    const state = await desktop(page, pet);
    await page.evaluate(() => Reflect.set(window, '__resident', document.querySelector('#pet svg')));
    state.messages = [letter('visit-1')];
    await page.locator('#refresh').click();
    await expect(page.locator('.pet-dock')).toHaveClass(/visiting/);
    await expect(page.locator(`.visitor svg.${pet === 'dog' ? 'cat' : 'dog'}`)).toHaveCount(1);
    await expect(page.locator(`#pet svg.${pet}`)).toHaveCount(1);
    await expect(page.locator('#bubble')).toContainText('来串门');
    // Unchanged synchronization must not recreate the resident or restart a visit.
    await page.locator('#refresh').click();
    expect(await page.evaluate(() => Reflect.get(window, '__resident') === document.querySelector('#pet svg'))).toBe(true);
    await page.locator('#collapse').click();
    await page.setViewportSize({ width: 180, height: 190 });
    await page.clock.runFor(2800);
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('.visitor, .visit-heart, #pet')) {
        for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = 2800; }
      }
    });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const selector of ['.visitor', '.visit-heart', '#pet', '#bubble']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(180);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(190);
    }
    await page.screenshot({ path: `test-results/visit-${pet}-compact.png`, omitBackground: true });
    await page.clock.runFor(2801);
    await expect(page.locator('.pet-dock')).not.toHaveClass(/visiting/);
    await expect(page.locator('.visitor')).toBeHidden();
    // Arrival does not mark the letter read; restarting does not repeat the cue.
    await expect(page.locator('#badge')).toHaveText('1');
    await page.reload();
    await expect(page.locator('#connection-text')).toContainText('已同步');
    await expect(page.locator('.pet-dock')).not.toHaveClass(/visiting|greet/);
    await expect(page.locator('#badge')).toHaveText('1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pawbridge.v1')!));
    expect(saved.announcedMessages).toEqual(['visit-1']);
    expect(saved.session.token).toBe('test-only-token');
  });
}

test('burst cues are sequential and bounded while every message remains in the inbox', async ({ page }) => {
  const state = await desktop(page);
  state.messages = Array.from({ length: 8 }, (_, i) => letter(`burst-${i}`, i === 1 ? 'pat' : 'miss'));
  await page.locator('#refresh').click();
  await expect(page.locator('.pet-dock')).toHaveAttribute('data-greeting-id', 'burst-0');
  await expect(page.locator('.visitor')).toHaveCount(1);
  await page.clock.runFor(5601);
  await expect(page.locator('.pet-dock')).toHaveAttribute('data-greeting-id', 'burst-1');
  await expect(page.locator('.pet-dock')).toHaveClass(/greet/);
  await expect(page.locator('.visitor')).toBeHidden();
  await page.clock.runFor(3001);
  await expect(page.locator('.pet-dock')).toHaveAttribute('data-greeting-id', 'burst-2');
  for (const id of ['burst-3', 'burst-4']) {
    await page.clock.runFor(5600);
    await expect(page.locator('.pet-dock')).toHaveAttribute('data-greeting-id', id);
  }
  await page.clock.runFor(5600);
  await expect(page.locator('.pet-dock')).not.toHaveClass(/visiting|greet/);
  await page.locator('#tab-inbox').click();
  await expect(page.locator('.letter')).toHaveCount(8);
  await page.locator('#refresh').click();
  await expect(page.locator('.pet-dock')).not.toHaveClass(/visiting|greet/);
});

test('reduced motion keeps a static visit and treats the partner name as text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await desktop(page);
  state.partner!.name = '<img src=x onerror=alert(1)>';
  state.messages = [letter('gentle-1')];
  await page.locator('#refresh').click();
  await expect(page.locator('.pet-dock')).toHaveClass(/visiting/);
  await expect(page.locator('.visitor')).toBeVisible();
  await expect(page.locator('.visitor')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#bubble')).toContainText(state.partner!.name);
  await expect(page.locator('#bubble img')).toHaveCount(0);
  await page.locator('#collapse').click();
  await page.setViewportSize({ width: 180, height: 190 });
  const bubble = await page.locator('#bubble').boundingBox();
  expect(bubble!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: 'test-results/visit-reduced-motion.png', omitBackground: true });
  await page.clock.runFor(2401);
  await expect(page.locator('.visitor')).toBeHidden();
});
