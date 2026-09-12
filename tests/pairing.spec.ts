import { test, expect } from '@playwright/test';

test('desktop canvas stays transparent and collapsing only changes the native window size', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: { command: string; args: unknown }[] = [];
    Object.assign(window, {
      isTauri: true,
      __pawbridgeCalls: calls,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' } },
        invoke: async (command: string, args: unknown) => { calls.push({ command, args: JSON.parse(JSON.stringify(args)) }); },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.getByRole('button', { name: '收起成桌宠' }).click();
  await expect(page.locator('#panel')).not.toBeVisible();
  const calls = await page.evaluate(() => Reflect.get(window, '__pawbridgeCalls'));
  expect(calls).toEqual([{ command: 'plugin:window|set_size', args: { label: 'main', value: { Logical: { width: 180, height: 190 } } } }]);
  await page.screenshot({ path: 'test-results/compact-desktop.png', omitBackground: true });
});

test('two desktops pair, share, retry offline, and animate greetings even while busy', async ({ browser }) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:1420', viewport: { width: 420, height: 900 } });
  const b = await browser.newContext({ baseURL: 'http://127.0.0.1:1420', viewport: { width: 420, height: 900 } });
  // Keep this test deterministic and independent of the weather provider.
  for (const context of [a, b]) await context.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: { temperature_2m: 28, weather_code: 1 } } }));
  const dog = await a.newPage(), cat = await b.newPage();
  const errors: string[] = [];
  dog.on('pageerror', error => errors.push(error.message));
  cat.on('pageerror', error => errors.push(error.message));
  try {
    await dog.goto('/');
    await dog.getByLabel('同步服务地址').fill('http://127.0.0.1:8788');
    await dog.getByLabel('你的昵称').fill('珠海小狗');
    await dog.getByRole('button', { name: '让我们住进桌面' }).click();
    await expect(dog.locator('#invite-code')).toHaveText(/^[A-F0-9]{12}$/);
    const code = await dog.locator('#invite-code').textContent();
    await cat.goto('/');
    await cat.getByLabel('同步服务地址').fill('http://127.0.0.1:8788');
    await cat.getByLabel('你的昵称').fill('北京小猫');
    await cat.getByLabel('领养方式').selectOption('join');
    await cat.getByLabel('对方的配对码').fill(code!);
    await cat.getByRole('button', { name: '让我们住进桌面' }).click();
    await expect(cat.getByRole('heading', { name: '珠海小狗' })).toBeVisible();
    await dog.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(dog.getByRole('heading', { name: '北京小猫' })).toBeVisible();
    await cat.getByRole('button', { name: '我的今天' }).click();
    await cat.getByLabel('我的心情').selectOption('想你');
    await cat.getByLabel('现在的状态').selectOption('busy');
    await cat.getByLabel('今日计划').fill('晚上九点，和你打电话。');
    await cat.getByRole('button', { name: '分享给对方' }).click();
    await expect(cat.getByRole('status')).toContainText('已经分享');
    await dog.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(dog.locator('.plan')).toContainText('晚上九点');
    await expect(dog.locator('.availability')).toHaveText('忙碌中');
    await a.setOffline(true);
    await dog.getByLabel('小纸条内容').fill('<img src=x onerror=alert(1)> 想你了');
    await dog.getByRole('button', { name: '寄出小纸条' }).click();
    await expect(dog.locator('#outbox')).toContainText('待寄出 1 条');
    await a.setOffline(false);
    await dog.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(dog.locator('#outbox')).toBeEmpty();
    await cat.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(cat.locator('#badge')).toHaveText('1');
    await expect(cat.locator('.pet-dock')).toHaveClass(/greet/);
    await cat.getByRole('button', { name: /小信箱/ }).click();
    await expect(cat.locator('.letter')).toHaveCount(1);
    await expect(cat.locator('.letter')).toContainText('<img src=x onerror=alert(1)>');
    await expect(cat.locator('.letter img')).toHaveCount(0);
    await cat.reload();
    await cat.getByRole('button', { name: /小信箱/ }).click();
    await expect(cat.locator('.letter')).toHaveCount(1);
    await cat.getByRole('button', { name: '这些都读过啦' }).click();
    await expect(cat.locator('.letter')).toHaveCount(0);
    await dog.screenshot({ path: 'test-results/paired-desktop.png', fullPage: true });
    // An unchanged profile becomes stale when the server date rolls over.
    await dog.route('**/api/sync', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.serverTime = new Date(Date.now() + 86400000).toISOString();
      await route.fulfill({ response, json: data });
    });
    await dog.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(dog.locator('.plan')).toContainText('上次分享的计划');
    await dog.getByRole('button', { name: '收起成桌宠' }).click();
    await expect(dog.locator('#panel')).not.toBeVisible();
    await expect(dog.locator('#pet')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});
