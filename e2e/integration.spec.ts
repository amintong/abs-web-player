/**
 * 页面集成测试 — 验证所有页面正常渲染、无崩溃、核心交互可用
 *
 * 注：所有路由都需要登录认证，无凭据时只验证"不崩溃"。
 */

import { test, expect, type Page } from '@playwright/test';

const SERVER = process.env.TEST_SERVER || '';
const USERNAME = process.env.TEST_USERNAME || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const hasCredentials = !!(SERVER && USERNAME);

// ---------- 辅助 ----------

/** 收集页面控制台错误 */
async function setupErrorCollector(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => { errors.push(err.message); });
  // 过滤已知无害的 console.error
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('WebSocket')) {
        errors.push(text);
      }
    }
  });
  return errors;
}

async function login(page: Page) {
  if (!hasCredentials) return;
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  if (!page.url().includes('/login')) return;
  await page.locator('input[type="url"]').fill(SERVER);
  await page.locator('input[type="text"]').fill(USERNAME);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/^((?!\/login).)*$/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// ---------- 测试 ----------

test.describe('页面集成测试', () => {

  test.describe('路由加载 — 无崩溃', () => {
    const routes = ['/', '/login', '/player', '/settings', '/search'];

    for (const path of routes) {
      test(`${path} — 加载无崩溃`, async ({ page }) => {
        const errors = await setupErrorCollector(page);
        await page.goto(path);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);

        const body = page.locator('body');
        await expect(body).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });

  test.describe('设置页 — UI 检查（已登录）', () => {

    test.beforeEach(async ({ page }) => {
      test.skip(!hasCredentials, '跳过 — 需要登录');
      await login(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    });

    test('所有面板可见', async ({ page }) => {
      await expect(page.getByText('设置')).toBeVisible();
      await expect(page.getByText('播放设置')).toBeVisible();
      await expect(page.getByText('播放倍速')).toBeVisible();
      await expect(page.getByText('片头片尾默认值')).toBeVisible();
      await expect(page.getByText('快进/快退')).toBeVisible();
      await expect(page.getByText('外观')).toBeVisible();
      await expect(page.getByText('深色模式')).toBeVisible();
      await expect(page.getByText('关于')).toBeVisible();
      await expect(page.getByText('缓存管理')).toBeVisible();
      await expect(page.getByText('检查更新')).toBeVisible();
    });

    test('倍速按钮点击', async ({ page }) => {
      const speedBtn = page.locator('button', { hasText: '1.5x' });
      if (await speedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await speedBtn.click();
        await page.waitForTimeout(300);
      }
    });

    test('清除缓存按钮可见', async ({ page }) => {
      const clearBtn = page.getByText('清除缓存');
      await expect(clearBtn).toBeVisible();
      if (!await clearBtn.isDisabled()) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }
    });

    test('退出登录按钮可见', async ({ page }) => {
      await expect(page.getByText('退出登录')).toBeVisible();
    });
  });

  test.describe('播放器页（已登录）', () => {

    test.beforeEach(async ({ page }) => {
      test.skip(!hasCredentials, '跳过 — 需要登录');
      await login(page);
    });

    test('无内容时显示空状态', async ({ page }) => {
      await page.goto('/player');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await expect(page.getByText('没有正在播放的内容')).toBeVisible({ timeout: 3000 });
    });
  });
});
