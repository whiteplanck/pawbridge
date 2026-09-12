import { test, expect } from '@playwright/test';
import { decodeInteraction, encodeInteraction, interactionTextLimit, interactions, readInteractionDrafts } from '../src/interactions';
import type { PendingGreeting } from '../src/types';
import { desktop } from './helpers';

test('every category round-trips through the existing message schema and obeys its length limit', () => {
  for (const item of interactions) {
    const limit = interactionTextLimit(item.id);
    const text = '你'.repeat(limit - 2) + '🐾';
    const payload = encodeInteraction(item.id, text);
    expect(['miss', 'pat', 'snack', 'note']).toContain(payload.kind);
    expect(payload.note.length).toBe(160);
    expect(decodeInteraction(payload)).toMatchObject({ id: item.id, text });
    expect(() => encodeInteraction(item.id, text + '！')).toThrow('太长');
    expect(decodeInteraction(encodeInteraction(item.id, '  ')).text).toBe(item.text);
    if (payload.kind === 'note') expect(payload.note).toContain(`【互动：${item.label}】\n`);
  }
  for (const note of ['普通纸条', '正文中的【互动：抱抱】\n你好', '【互动：未知】\n你好', '【互动：抱抱】没有换行']) {
    expect(decodeInteraction({ kind: 'note', note })).toMatchObject({ id: 'note', text: note });
  }
  expect(decodeInteraction({ kind: 'miss', note: '' }).visit).toBe(true);
  expect(readInteractionDrafts({ hug: '自己的文字', water: 'x'.repeat(161), unknown: 'ignored' })).toEqual({ hug: '自己的文字' });
  expect(readInteractionDrafts(null)).toEqual({});
});

test('category-specific editable words survive switching, incoming sync, and reload without sending', async ({ page }) => {
  const state = await desktop(page);
  const sent: PendingGreeting[] = [];
  await page.route('**/api/greetings', async route => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { id: 'sent-1' } });
  });
  await page.locator('#tab-greetings').click();
  await expect(page.locator('.interaction-grid button')).toHaveCount(9);
  await page.locator('[data-interaction="hug"]').click();
  const field = page.getByLabel('互动文字', { exact: true });
  await field.fill('忙完我来接你，抱抱！');
  await page.locator('.interaction-grid [data-interaction="night"]').click();
  await field.fill('小猫晚安，明天见。');
  await page.locator('.interaction-grid [data-interaction="hug"]').click();
  await expect(field).toHaveValue('忙完我来接你，抱抱！');
  state.messages = [{ id: 'incoming', ...encodeInteraction('water', '记得喝水'), createdAt: new Date().toISOString() }];
  await page.locator('#refresh').click();
  await expect(page.locator('#badge')).toHaveText('1');
  await expect(field).toHaveValue('忙完我来接你，抱抱！');
  await page.reload();
  await page.locator('#tab-greetings').click();
  await expect(page.locator('.interaction-grid [data-interaction="hug"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(field).toHaveValue('忙完我来接你，抱抱！');
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: '发送「抱抱」', exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject(encodeInteraction('hug', '忙完我来接你，抱抱！'));
  await expect(field).toHaveValue('忙完我来接你，抱抱！');
  await page.locator('.interaction-grid [data-interaction="night"]').click();
  await expect(field).toHaveValue('小猫晚安，明天见。');
  await page.getByRole('button', { name: '恢复默认文字' }).click();
  await expect(field).toHaveValue(interactions.find(item => item.id === 'night')!.text);
  await page.screenshot({ path: 'test-results/interaction-composer.png' });
});

test('custom interaction retries offline with an identical request and preserved draft', async ({ page }) => {
  await desktop(page);
  let offline = true;
  const attempts: PendingGreeting[] = [];
  await page.route('**/api/greetings', async route => {
    attempts.push(route.request().postDataJSON());
    if (offline) await route.abort('failed');
    else await route.fulfill({ json: { id: 'delivered' } });
  });
  await page.locator('#tab-greetings').click();
  await page.locator('[data-interaction="cheer"]').click();
  await page.getByLabel('互动文字', { exact: true }).fill('今天也站在你这边。');
  await page.locator('#interaction-send').click();
  await expect(page.locator('#outbox')).toContainText('待寄出 1 条');
  const queued = attempts[0];
  await page.reload();
  await page.locator('#tab-greetings').click();
  await expect(page.getByLabel('互动文字', { exact: true })).toHaveValue('今天也站在你这边。');
  offline = false;
  await page.locator('#refresh').click();
  await expect(page.locator('#outbox')).toBeEmpty();
  expect(attempts.length).toBeGreaterThanOrEqual(2);
  for (const attempt of attempts) expect(attempt).toEqual(queued);
  expect(decodeInteraction(queued).id).toBe('cheer');
});

test('custom message text is safe in both the bubble and inbox', async ({ page }) => {
  const state = await desktop(page);
  const text = '<img src=x onerror=alert(1)> 想抱抱你\n晚点见';
  state.messages = [{ id: 'custom-safe', ...encodeInteraction('hug', text), createdAt: new Date().toISOString() }];
  await page.locator('#refresh').click();
  await expect(page.locator('.pet-dock')).toHaveAttribute('data-interaction', 'hug');
  await expect(page.locator('.visitor svg.dog')).toHaveCount(1);
  await expect(page.locator('#bubble')).toContainText(text);
  await expect(page.locator('#bubble img')).toHaveCount(0);
  await page.locator('#tab-inbox').click();
  await expect(page.locator('.letter strong')).toHaveText('抱抱');
  await expect(page.locator('.letter p')).toHaveText(text);
  await expect(page.locator('.letter img')).toHaveCount(0);
});

test('all nine interactions fit the compact window and retain their custom text', async ({ page }) => {
  const state = await desktop(page);
  for (const item of interactions) {
    state.messages = [{ id: `action-${item.id}`, ...encodeInteraction(item.id, `给你的${item.label}`), createdAt: new Date().toISOString() }];
    await page.locator('#refresh').click();
    await expect(page.locator('.pet-dock')).toHaveAttribute('data-interaction', item.id);
    await expect(page.locator('#bubble')).toContainText(`给你的${item.label}`);
    if (item.visit) await expect(page.locator('.visitor')).toBeVisible();
    else await expect(page.locator('.visitor')).toBeHidden();
    await page.locator('#collapse').click();
    await page.setViewportSize({ width: 180, height: 190 });
    const midpoint = item.visit ? 2800 : 1500;
    await page.clock.runFor(midpoint);
    await page.evaluate(midpoint => {
      for (const element of document.querySelectorAll('.visitor, .visit-heart, #pet')) {
        for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = midpoint; }
      }
    }, midpoint);
    for (const selector of ['#pet', '#bubble', '.visit-heart', ...(item.visit ? ['.visitor'] : [])]) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(180);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(190);
    }
    await page.screenshot({ path: `test-results/interaction-${item.id}.png`, omitBackground: true });
    await page.clock.runFor(midpoint + 1);
    await expect(page.locator('.visit-heart')).toBeHidden();
    await page.locator('#pet').click();
    await page.setViewportSize({ width: 390, height: 740 });
  }
});

test('reduced motion applies to new categories too', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await desktop(page);
  for (const item of interactions.filter(item => item.kind === 'note')) {
    state.messages = [{ id: `gentle-${item.id}`, ...encodeInteraction(item.id, ''), createdAt: new Date().toISOString() }];
    await page.locator('#refresh').click();
    await expect(page.locator('.pet-dock')).toHaveAttribute('data-interaction', item.id);
    await expect(page.locator('.visit-heart')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#pet')).toHaveCSS('animation-name', 'none');
    await page.clock.runFor(2401);
    await expect(page.locator('.visit-heart')).toBeHidden();
  }
});
