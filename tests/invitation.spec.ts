import { test, expect } from '@playwright/test';
import { createInvitation, parseInvitation } from '../src/invitation';

test('invitation includes only normalized endpoint and one-time code; unsafe inputs are rejected', () => {
  const invite = createInvitation('https://couple.example/', 'ABCDEF123456');
  expect(parseInvitation(`  ${invite}\n`)).toEqual({ v: 1, server: 'https://couple.example', code: 'ABCDEF123456' });
  expect(() => createInvitation('http://127.0.0.1:8787', 'ABCDEF123456')).toThrow('本机测试地址');
  expect(() => createInvitation('https://user:password@couple.example', 'ABCDEF123456')).toThrow();
  expect(() => parseInvitation('ABCDEF123456')).toThrow('不是旧版');
  expect(() => parseInvitation('PB1.broken')).toThrow('不完整');
  for (const data of [{ v: 2, server: 'https://couple.example', code: 'ABCDEF123456' },
    { v: 1, server: 'file:///etc/passwd', code: 'ABCDEF123456' },
    { v: 1, server: 'https://couple.example', code: '' }]) {
    expect(() => parseInvitation(`PB1.${btoa(JSON.stringify(data)).replace(/=+$/, '')}`)).toThrow();
  }
});

test('recipient pastes an invitation without server configuration; restart and cancelled settings preserve identity', async ({ browser }) => {
  const dogContext = await browser.newContext({ baseURL: 'http://127.0.0.1:1420' });
  const catContext = await browser.newContext({ baseURL: 'http://127.0.0.1:1420', viewport: { width: 390, height: 740 } });
  for (const context of [dogContext, catContext]) {
    // Simulate a deployed HTTPS endpoint while using the real isolated test server.
    await context.route('https://couple.example/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const response = await route.fetch({ url: `http://127.0.0.1:8788${path}` });
      await route.fulfill({ response });
    });
    await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: { temperature_2m: 24, weather_code: 0 } } }));
  }
  const dog = await dogContext.newPage(), cat = await catContext.newPage();
  try {
    await dog.goto('/');
    await dog.getByText('建立小家或本机测试', { exact: true }).click();
    await dog.getByLabel('同步服务地址').fill('https://couple.example');
    await dog.getByLabel('你的昵称').fill('珠海小狗');
    await dog.getByRole('button', { name: '让我们住进桌面' }).click();
    await expect(dog.getByLabel('给她的邀请口令')).toBeVisible();
    const invite = await dog.getByLabel('给她的邀请口令').inputValue();
    await cat.goto('/');
    await expect(cat.getByLabel('同步服务地址')).not.toBeVisible();
    await cat.getByLabel('对方发来的邀请口令').fill(invite);
    await expect(cat.locator('#invitation-preview')).toContainText('couple.example');
    await cat.screenshot({ path: 'test-results/windows-join.png', fullPage: true });
    await cat.getByRole('button', { name: '领养小猫', exact: true }).click();
    await expect(cat.getByRole('heading', { name: '珠海小狗' })).toBeVisible();
    await cat.reload();
    await expect(cat.getByRole('heading', { name: '珠海小狗' })).toBeVisible();
    await expect(cat.locator('#connection-text')).toContainText('已同步');
    await cat.getByRole('button', { name: '连接设置', exact: true }).click();
    await cat.getByLabel('对方发来的邀请口令').fill('broken');
    await cat.getByRole('button', { name: '领养小猫', exact: true }).click();
    await expect(cat.getByRole('status')).toContainText('完整邀请口令');
    await cat.getByRole('button', { name: '返回现在的小家' }).click();
    await expect(cat.getByRole('heading', { name: '珠海小狗' })).toBeVisible();
    const state = await cat.evaluate(() => JSON.parse(localStorage.getItem('pawbridge.v1')!));
    expect(state.snapshot.self.city).toBe('beijing');
    expect(state.snapshot.self.pet).toBe('cat');
    expect(parseInvitation(invite)).not.toHaveProperty('token');
  } finally { await dogContext.close(); await catContext.close(); }
});
