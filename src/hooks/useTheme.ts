import { useEffect } from 'react';
import { useAppConfig, type ThemeMode } from '../utils/configManager';

/** 根据主题配置，在 <html> 上切换 dark class */
export function useTheme() {
  const [appConfig] = useAppConfig();
  const theme = appConfig.theme;

  useEffect(() => {
    const apply = (mode: ThemeMode) => {
      let isDark: boolean;
      if (mode === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = mode === 'dark';
      }
      document.documentElement.classList.toggle('dark', isDark);
      // 更新 PWA 状态栏颜色
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', isDark ? '#000000' : '#f5f5f7');
    };

    apply(theme);

    // 跟随系统模式时，监听系统主题变化
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.classList.toggle('dark', e.matches);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);
}
