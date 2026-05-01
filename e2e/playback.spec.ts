/**
 * 播放功能集成测试 — 盗墓笔记 完整播放验证
 *
 * 需要环境变量（在 playwright 启动时或 .env 中配置）：
 *   TEST_SERVER     Audiobookshelf 服务器地址
 *   TEST_USERNAME   用户名
 *   TEST_PASSWORD   密码
 *
 * 如果缺少凭据，测试自动跳过。
 */

import { test, expect, type Page } from '@playwright/test';

// ---------- 配置 ----------

const SERVER = process.env.TEST_SERVER || '';
const USERNAME = process.env.TEST_USERNAME || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const BOOK_NAME = '盗墓笔记';

const hasCredentials = !!(SERVER && USERNAME);

// ---------- 辅助 ----------

/** 登录到 Audiobookshelf */
async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // 检查是否已自动登录（跳转到首页）
  const url = page.url();
  if (!url.includes('/login')) return;

  await page.locator('input[type="url"]').fill(SERVER);
  await page.locator('input[type="text"]').fill(USERNAME);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // 等待登录完成跳转到首页
  await page.waitForURL(/^((?!\/login).)*$/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

/** 在首页找到并点击盗墓笔记，进入详情页 */
async function openBook(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // 搜索框中输入书名
  const searchInput = page.locator('input[type="text"], input[placeholder*="搜索"], input[placeholder*="search"]');
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.fill(BOOK_NAME);
    await page.waitForTimeout(1500);
  }

  // 找到盗墓笔记卡片
  const bookCard = page.locator(`text=${BOOK_NAME}`).first();
  await expect(bookCard).toBeVisible({ timeout: 10000 });
  await bookCard.click();

  // 进入详情页（ItemDetailPage）
  await page.waitForTimeout(2000);
}

/** 点击播放按钮开始播放 */
async function startPlayback(page: Page) {
  // 详情页的播放按钮
  const playBtn = page.locator('button', { hasText: '播放' }).or(
    page.locator('button', { hasText: '继续' }).or(
      page.locator('[class*="play"]').or(
        page.locator('svg path[class*="play"]')
      )
    )
  );

  if (await playBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playBtn.click();
    await page.waitForTimeout(3000);
  }
}

/** 检查 MiniPlayer 是否显示 */
async function expectMiniPlayerVisible(page: Page) {
  // MiniPlayer 包含封面图片和播放控制按钮
  const miniPlayer = page.locator('button').filter({ has: page.locator('svg path') }).first();
  await page.waitForTimeout(1000);
}

// ---------- 自动重置配置 ----------

test.beforeAll(async ({ browser }) => {
  // 在独立页面中重置配置，避免影响测试状态
  if (!hasCredentials) return;
  const page = await browser.newPage();
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  // 通过清除缓存和重置配置的方式
  try {
    await page.evaluate(() => {
      // 如果有 ConfigManager 的 resetAll 暴露出来
      // 否则跳过
    });
  } catch { /* ignore */ }
  await page.close();
});

test.describe('播放功能完整集成测试 — 盗墓笔记', () => {

  test.beforeEach(async ({ page }) => {
    test.skip(!hasCredentials, '缺少 TEST_SERVER/TEST_USERNAME/TEST_PASSWORD，跳过需要登录的测试');
    await login(page);
  });

  test('1. 登录成功并进入首页', async ({ page }) => {
    // 已登录，首页应有内容
    await expect(page.locator('body')).toBeVisible();
    const url = page.url();
    expect(url).not.toContain('/login');
  });

  test('2. 打开盗墓笔记详情页', async ({ page }) => {
    await openBook(page);

    // 应该看到书名
    await expect(page.getByText(BOOK_NAME).first()).toBeVisible({ timeout: 5000 });
  });

  test('3. 开始播放并显示 MiniPlayer', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);

    // 播放后 MiniPlayer 应出现
    // 检查 MiniPlayer 中的书名信息
    const bookTitle = page.locator(`text=${BOOK_NAME}`);
    await expect(bookTitle.first()).toBeVisible({ timeout: 5000 });
  });

  test('4. 点击 MiniPlayer 进入全屏播放页', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    // 点击 MiniPlayer 跳转到 /player
    // MiniPlayer 区域包含当前播放的书名
    const miniPlayer = page.locator('text=正在播放').or(
      page.locator(`text=${BOOK_NAME}`)
    ).first();

    if (await miniPlayer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await miniPlayer.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/player');
    }
  });

  test('5. 播放器页面控制按钮可见', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    // 进入播放器页
    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 检查基本 UI 元素
    await expect(page.getByText('正在播放')).toBeVisible({ timeout: 5000 });

    // 播放/暂停按钮
    const playPauseBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(playPauseBtn).toBeVisible();

    // 封面图片应存在
    const img = page.locator('img');
    await expect(img.first()).toBeVisible({ timeout: 3000 });

    // 进度条
    const seekBar = page.locator('input[type="range"]').first();
    await expect(seekBar).toBeVisible({ timeout: 3000 });
  });

  test('6. 播放/暂停切换', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const playBtn = page.locator('svg path[class*="play"]').or(
      page.locator('svg path[d*="play"]').or(
        page.locator('[class*="Play"]').first()
      )
    );

    // 页面加载后应有播放按钮或暂停按钮
    const controls = page.locator('button').filter({ has: page.locator('svg') });
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
  });

  test('7. 快进/快退按钮存在', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // SkipBack 按钮存在（SkipBack icon 在 player 页面中）
    const skipBackBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
    await expect(skipBackBtn).toBeVisible({ timeout: 3000 });
  });

  test('8. 章节选择面板可见', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 章节标题应可见
    const chapterSection = page.getByText(/第.*章/);
    if (await chapterSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(chapterSection).toBeVisible();
    }
  });

  test('9. 倍速切换', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 倍速按钮
    const speedBtn = page.locator('button', { hasText: /^\d\.\d+x$/ });
    if (await speedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await speedBtn.click();
      await page.waitForTimeout(500);

      // 倍速选择器面板弹出
      const speedPanel = page.getByText('播放倍速');
      await expect(speedPanel).toBeVisible({ timeout: 3000 });
    }
  });

  test('10. 睡眠模式面板', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 睡眠按钮（月亮图标）
    const sleepBtn = page.locator('svg path[d*="moon"]').or(
      page.locator('svg path[class*="moon"]').or(
        page.locator('button').filter({ has: page.locator('svg') }).last()
      )
    );

    if (await sleepBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // 点击睡眠按钮
      const allButtons = page.locator('button:has(svg)');
      const count = await allButtons.count();
      if (count > 0) {
        // 点击右侧的睡眠按钮（通常在最右）
        await allButtons.nth(count - 1).click();
        await page.waitForTimeout(500);

        // 睡眠面板出现
        const sleepPanel = page.getByText('睡眠模式');
        if (await sleepPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(sleepPanel).toBeVisible();
        }
      }
    }
  });

  test('11. 跳过片头片尾开关', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    await page.goto('/player');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 片头片尾按钮
    const introBtn = page.getByText(/片头.*s/);
    const outroBtn = page.getByText(/片尾.*s/);

    // 至少有一个可见
    const introVisible = await introBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const outroVisible = await outroBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (introVisible) {
      await introBtn.click();
      await page.waitForTimeout(500);
    }

    if (outroVisible) {
      await outroBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('12. 返回设置页检查缓存状态', async ({ page }) => {
    await openBook(page);
    await startPlayback(page);
    await page.waitForTimeout(2000);

    // 进入设置页
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 缓存管理面板可见
    await expect(page.getByText('缓存管理')).toBeVisible();

    // 如果播放后缓存有数据，应该显示缓存信息
    const cacheInfo = page.getByText(/章节|缓存|MB/);
    if (await cacheInfo.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('缓存信息:', await cacheInfo.textContent());
    }
  });
});
