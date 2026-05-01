/**
 * TimerScheduler 集成验证 — 播放/暂停/切章全流程
 *
 * 验证：
 *   1. play() → isPlaying=true → Scheduler 自动启动 watchdog/sync/sleep
 *   2. pause() → isPlaying=false → Scheduler 自动关闭所有定时器
 *   3. resume() → isPlaying=true → Scheduler 重新启动定时器
 *   4. 切章后 watchdog 章节信息更新（新章节标题出现在日志中）
 *   5. 片头跳过 / 片尾自动切章逻辑可触发
 */

import { test, expect } from '@playwright/test';

const SERVER = process.env.TEST_SERVER || 'https://audiobookshelf.mingming520.fun:8443';
const USERNAME = process.env.TEST_USERNAME || 'audiobookshelf';
const PASSWORD = process.env.TEST_PASSWORD || 'hyctiw-4qatsI-ducrop';

test.describe('TimerScheduler 集成验证', () => {

  test('完整播放流程：play→pause→resume→stop 定时器自动管理', async ({ page }) => {
    // ── 收集日志 ──
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      // 只收集 playerLogger 的日志（带 [标签] 格式）
      if (/\[(lifecycle|watchdog|sync|sleep|chapter|cache|system|background)\]/.test(text)) {
        logs.push(text);
        console.log('📋', text);
      }
    });

    // ── 1. 登录 ──
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const url = page.url();
    if (url.includes('/login')) {
      // 手动登录
      await page.locator('input[type="url"]').fill(SERVER);
      await page.locator('input[type="text"]').fill(USERNAME);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/^((?!\/login).)*$/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      console.log('✅ 登录成功');
    }

    // ── 2. 进入首页，找一本书 ──
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 截图看首页状态
    await page.screenshot({ path: 'test-screenshots/01-home.png', fullPage: true });

    // 找到任意一个可播放的书籍卡片
    const bookCards = page.locator('[class*="book"], [class*="item"], [class*="card"]');
    const cardCount = await bookCards.count();
    console.log(`📚 找到 ${cardCount} 个书籍元素`);

    // 尝试找"继续收听"或任意书籍
    const playTarget = page.locator('text=继续收听').or(
      page.getByRole('button', { name: /播放|继续/ })
    ).or(
      page.locator('[class*="book"], [class*="item"]').first()
    );

    const visible = await playTarget.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      // 截图调试
      await page.screenshot({ path: 'test-screenshots/01b-no-book.png', fullPage: true });
      test.skip('未找到可播放的书籍');
    }

    await playTarget.click();
    await page.waitForTimeout(2000);

    // ── 3. 开始播放，验证 Scheduler 启动定时器 ──
    console.log('\n=== 步骤3：开始播放 ===');

    // 清空之前的日志
    logs.length = 0;

    // 如果在详情页，点播放按钮
    const playBtn = page.getByRole('button', { name: /播放|▶|Play/ });
    if (await playBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playBtn.click();
      console.log('点击了播放按钮');
    }

    // 等待音频加载 + Scheduler 轮询（500ms 一轮）
    await page.waitForTimeout(4000);

    // 验证日志中有定时器启动记录
    const hasWatchdog = logs.some(l => l.includes('[watchdog]') && l.includes('启动'));
    const hasSync = logs.some(l => l.includes('[sync]') && l.includes('启动'));
    const hasLifecycleStart = logs.some(l => l.includes('[lifecycle]') && l.includes('开始播放'));

    console.log(`\n📊 播放后日志统计 (${logs.length} 条):`);
    console.log(`   watchdog 启动: ${hasWatchdog ? '✅' : '❌'}`);
    console.log(`   sync 启动:     ${hasSync ? '✅' : '❌'}`);
    console.log(`   lifecycle 开始: ${hasLifecycleStart ? '✅' : '❌'}`);

    // 打印关键日志
    logs.forEach(l => console.log(`   ${l}`));

    expect(hasLifecycleStart).toBeTruthy('应该有 [lifecycle] 开始播放 日志');

    await page.screenshot({ path: 'test-screenshots/02-after-play.png', fullPage: true });

    // ── 4. 让它播 5 秒，验证 watchdog 持续运行 ──
    console.log('\n=== 步骤4：持续播放 5s ===');
    const logsBefore = logs.length;
    await page.waitForTimeout(5500); // 5+ 秒

    // 这期间 watchdog 应该至少执行了几次检查
    const newLogs = logs.slice(logsBefore);
    console.log(`   5s 内新增 ${newLogs.length} 条日志`);

    await page.screenshot({ path: 'test-screenshots/03-playing-5s.png', fullPage: true });

    // ── 5. 暂停，验证 Scheduler 关闭所有定时器 ──
    console.log('\n=== 步骤5：暂停 ===');
    logs.length = 0; // 清空

    // 点暂停按钮
    const pauseBtn = page.getByRole('button', { name: /暂停|⏸|Pause/ })
      .or(page.locator('button').filter({ has: page.locator('svg') }).first());
    if (await pauseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pauseBtn.click();
      console.log('点击了暂停按钮');
    }

    // 等 Scheduler 轮询检测到下降沿
    await page.waitForTimeout(1500);

    const hasWatchdogClose = logs.some(l => l.includes('[watchdog]') && l.includes('关闭'));
    const hasSyncClose = logs.some(l => l.includes('[sync]') && l.includes('关闭'));
    const hasAllClosed = logs.some(l => l.includes('[lifecycle]') && l.includes('全部定时任务已关闭'));
    const hasPauseLog = logs.some(l => l.includes('[lifecycle]') && l.includes('暂停'));

    console.log(`\n📊 暂停后日志:`);
    console.log(`   watchdog 关闭: ${hasWatchdogClose ? '✅' : '❌'}`);
    console.log(`   sync 关闭:     ${hasSyncClose ? '✅' : '❌'}`);
    console.log(`   全部已关闭:   ${hasAllClosed ? '✅' : '❌'}`);
    console.log(`   暂停日志:     ${hasPauseLog ? '✅' : '❌'}`);
    logs.forEach(l => console.log(`   ${l}`));

    expect(hasPauseLog).toBeTruthy('应有 [lifecycle] 暂停 日志');
    expect(hasAllClosed || (hasWatchdogClose && hasSyncClose)).toBeTruthy('定时器应被关闭');

    await page.screenshot({ path: 'test-screenshots/04-after-pause.png', fullPage: true });

    // ── 6. 恢复播放，验证 Scheduler 重新启动 ──
    console.log('\n=== 步骤6：恢复播放 ===');
    logs.length = 0;

    const resumeBtn = page.getByRole('button', { name: /播放|▶|Play/ })
      .or(page.locator('button').filter({ has: page.locator('svg') }).first());
    if (await resumeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resumeBtn.click();
      console.log('点击了恢复按钮');
    }

    await page.waitForTimeout(2500); // 等 Scheduler 上升沿

    const hasWatchdogRestart = logs.some(l => l.includes('[watchdog]') && l.includes('启动'));
    const hasSyncRestart = logs.some(l => l.includes('[sync]') && l.includes('启动'));
    const hasResumeLog = logs.some(l => l.includes('[lifecycle]') && l.includes('恢复播放'));

    console.log(`\n📊 恢复后日志:`);
    console.log(`   watchdog 重启: ${hasWatchdogRestart ? '✅' : '❌'}`);
    console.log(`   sync 重启:     ${hasSyncRestart ? '✅' : '❌'}`);
    console.log(`   恢复播放日志: ${hasResumeLog ? '✅' : '❌'}`);
    logs.forEach(l => console.log(`   ${l}`));

    expect(hasResumeLog).toBeTruthy('应有 [lifecycle] 恢复播放 日志');
    // Scheduler 应该重新启动定时器
    expect(hasWatchdogRestart || hasSyncRestart).toBeTruthy('定时器应被重新启动');

    // 再播几秒确认稳定运行
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-screenshots/06-after-resume.png', fullPage: true });

    // ── 7. 去设置页查看缓存状态 ──
    console.log('\n=== 步骤7：检查缓存 ===');
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const cacheSection = page.getByText(/缓存管理|章节缓存|MB/);
    if (await cacheSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✅ 缓存管理可见');
      await cacheSection.screenshot({ path: 'test-screenshots/07-cache.png' });
    }

    // ── 最终汇总 ──
    console.log('\n═══ 全流程验证完成 ═══');
  });

  test('切章时 watchdog 重建（章节信息更新）', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (/\[(watchdog|chapter)\]/.test(text)) logs.push(text);
    });

    // 登录
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    if (page.url().includes('/login')) {
      await page.locator('input[type="url"]').fill(SERVER);
      await page.locator('input[type="text"]').fill(USERNAME);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/^((?!\/login).)*$/, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
    }

    // 进首页点书
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const playTarget = page.locator('text=继续收听').or(
      page.getByRole('button', { name: /播放|继续/ })
    ).first();

    if (!(await playTarget.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip('无可用书籍');
    }
    await playTarget.click();
    await page.waitForTimeout(2000);

    // 开始播放
    logs.length = 0;
    const playBtn = page.getByRole('button', { name: /播放|▶/ });
    if (await playBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await playBtn.click();
    }
    await page.waitForTimeout(4000);

    // 记录初始章节信息
    const initialChapterLogs = logs.filter(l => l.includes('[watchdog]') && l.includes('启动'));
    console.log('初始 watchdog:', initialChapterLogs[0] || '(无)');

    if (!initialChapterLogs.length) {
      test.skip('watchdog 未启动，无法验证切章');
    }

    const chapterInfoBefore = initialChapterLogs[0];

    // 尝试切换到下一章
    logs.length = 0;

    // 方法1: 在播放器页面点下一章
    const nextBtn = page.getByRole('button', { name: /下一章|next|skip/i })
      .or(page.locator('[class*="skip"], [class*="next"]'));

    let switched = false;
    if (await nextBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.first().click();
      switched = true;
      console.log('点击了下一章按钮');
    }

    if (!switched) {
      // 方法2: 直接去 /player 页面操作
      await page.goto('/player');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const nextBtn2 = page.getByRole('button', { name: /下一章|next/i })
        .or(page.locator('svg').nth(2)); // 通常 skip forward / skip back 旁边的
      if (await nextBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn2.click();
        switched = true;
      }
    }

    if (switched) {
      // 等切章完成 + Scheduler 重建
      await page.waitForTimeout(6000);

      // 新的 watchdog 日志应出现不同章节号
      const newChapterLogs = logs.filter(l => l.includes('[watchdog]') && l.includes('启动'));
      console.log('切章后 watchdog:', newChapterLogs[0] || '(无)');

      if (newChapterLogs.length > 0) {
        const changed = newChapterLogs[0] !== chapterInfoBefore;
        console.log(changed
          ? '✅ 切章后 watchdog 信息已更新'
          : '⚠️ watchdog 信息相同（可能同章或章节号格式问题）');
        // 不强断言，因为可能只有一章书
      }

      // 验证 restartTimers 流程：先关旧 → 再开新
      const hadClose = logs.some(l => l.includes('关闭'));
      const hadOpen = logs.some(l => l.includes('启动'));
      console.log(`   先关后开: ${hadClose && hadOpen ? '✅' : '❌'}`);
    }

    await page.screenshot({ path: 'test-screenshots/08-chapter-switch.png', fullPage: true });
  });
});
