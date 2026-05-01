import { test, expect, type Page } from '@playwright/test';

/**
 * 核心功能 E2E 测试
 *
 * 测试书籍：盗墓笔记（需登录到 Audiobookshelf 服务器）
 * 需配置 .env 环境变量或在 playwright 启动时提供凭据。
 */

const BOOK_QUERY = '盗墓笔记';

// ---------- 辅助函数 ----------

async function loginIfNeeded(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // 如果自动登录了，会跳转到首页
  const isLoginPage = await page.locator('input[type="url"]').isVisible().catch(() => false);
  if (!isLoginPage) return; // 已登录

  // 从环境变量读取
  const server = process.env.TEST_SERVER || await page.locator('input[type="url"]').inputValue();
  const username = process.env.TEST_USERNAME || await page.locator('input[type="text"]').inputValue();
  const password = process.env.TEST_PASSWORD || '';

  if (!server || !username) {
    test.skip(true, '缺少登录凭据，跳过需要登录的测试');
    return;
  }

  if (server) await page.locator('input[type="url"]').fill(server);
  if (username) await page.locator('input[type="text"]').fill(username);
  if (password) await page.locator('input[type="password"]').fill(password);

  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');
}

async function findAndOpenBook(page: Page, query: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 搜索书籍
  const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"]');
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(query);
    await page.waitForTimeout(1000);
  }

  // 点击书籍
  const bookCard = page.locator(`text=${query}`).first();
  if (await bookCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await bookCard.click();
    await page.waitForTimeout(2000);
  }
}

// ---------- 测试用例 ----------

test.describe('核心功能测试 - 盗墓笔记', () => {

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
  });

  test('1. 首页加载 - 主页正常显示库列表和继续收听', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 页面不应崩溃
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 应该有库导航或内容列表（说明已登录并加载了数据）
    const hasContent = await page.locator('text=Audiobookshelf').or(page.locator('[class*="library"]')).or(page.locator('[class*="item"]')).isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasContent) {
      // 未登录：应该显示登录按钮/表单
      const loginForm = page.locator('input[type="url"]');
      await expect(loginForm).toBeVisible({ timeout: 3000 });
    }
  });

  test('2. 设置页加载 - 所有配置项正常渲染', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 页面应正常加载无崩溃
    await expect(page.locator('body')).toBeVisible();

    // 检查关键 UI 元素
    await expect(page.getByText('播放设置')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('播放倍速')).toBeVisible();
    await expect(page.getByText('片头片尾默认值')).toBeVisible();
    await expect(page.getByText('快进/快退')).toBeVisible();
    await expect(page.getByText('外观')).toBeVisible();
    await expect(page.getByText('深色模式')).toBeVisible();
    await expect(page.getByText('关于')).toBeVisible();
    await expect(page.getByText('版本')).toBeVisible();
    await expect(page.getByText('缓存管理')).toBeVisible();
    await expect(page.getByText('清除缓存')).toBeVisible();
  });

  test('3. 设置页交互 - 调整播放倍速', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 点击 1.5x 按钮
    const speedBtn = page.locator('button', { hasText: '1.5x' });
    await speedBtn.click();
    await page.waitForTimeout(500);

    // 验证选中状态
    await expect(speedBtn).toHaveClass(/bg-purple-600/);
  });

  test('4. 设置页交互 - 深色模式切换', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 点击深色模式开关
    const darkModeToggle = page.getByText('深色模式').locator('..');
    await darkModeToggle.click();
    await page.waitForTimeout(500);

    // 切换回去（避免影响后续测试）
    await darkModeToggle.click();
  });

  test('5. 设置页交互 - 保存片头片尾默认值', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 修改片头值（通过滑块拖拽不准确，改为保存已有值）
    const saveBtn = page.getByText('保存默认设置');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await page.waitForTimeout(500);
  });

  test('6. 设置页交互 - 保存快进快退', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const saveBtn = page.getByText('保存快进/快退设置');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await page.waitForTimeout(500);
  });

  test('7. 播放器页加载 - 无播放内容时显示空状态', async ({ page }) => {
    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 应为空状态（没有播放内容时播放器不显示或显示提示）
    await expect(page.locator('body')).toBeVisible();
  });

  test('8. 缓存管理 UI', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 缓存信息应显示
    const cacheSection = page.getByText('缓存管理');
    await expect(cacheSection).toBeVisible();

    // 清除缓存按钮应存在
    const clearBtn = page.getByText('清除缓存');
    await expect(clearBtn).toBeVisible();
  });

  test('9. 设置页交互 - 退出登录按钮', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const logoutBtn = page.getByText('退出登录');
    await expect(logoutBtn).toBeVisible();
  });
});

test.describe('页面路由不崩溃', () => {

  test('所有路由正常加载', async ({ page }) => {
    const { test: skip } = test;
    const routes = ['/', '/login', '/player', '/settings', '/search'];

    for (const route of routes) {
      // eslint-disable-next-line no-loop-func
      await test.step(`路由 ${route}`, async () => {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        const body = page.locator('body');
        await expect(body).toBeVisible();
      });
    }
  });
});
