import { useState, useEffect } from 'react';

/**
 * iOS PWA 底部空白调试工具
 * 在真机上叠加显示各层尺寸信息 + 彩色边框标注容器边界
 *
 * 使用方式：在 App.tsx 中 <DebugOverlay /> 放在 </ProtectedRoutes> 之后
 * 调试完成后删除此组件
 */
export default function DebugOverlay() {
  const [info, setInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    function measure() {
      const vv = window.visualViewport;
      const root = document.getElementById('root');
      const appMain = document.querySelector('[class*="overflow-y-auto"]') as HTMLElement;
      const mini = document.querySelector('[class*="fixed"][class*="bottom-0"]') as HTMLElement;

      const computedRoot = root ? getComputedStyle(root) : null;
      const computedApp = appMain ? getComputedStyle(appMain) : null;

      // 读取 CSS 变量实际值
      const appHeight = getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim();
      const vhVar = getComputedStyle(document.documentElement).getPropertyValue('--vh').trim();
      const safeTop = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top').trim();
      const safeBottom = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom').trim();

      setInfo({
        '📱 screen': `${screen.width}x${screen.height}`,
        '📐 window.iH': `${window.innerHeight}px`,
        '📐 vv.height': vv ? `${vv.height}px` : 'N/A',
        '📐 vv.offsetTop': vv ? `${vv.offsetTop}px` : 'N/A',
        '⚡ --app-height': appHeight || '(not set)',
        '⚡ --vh': vhVar || '(not set)',
        '🔒 safe-top': safeTop || '0',
        '🔒 safe-bottom': safeBottom || '0',
        '#root H': root ? `${root.clientHeight}px` : 'N/A',
        '#root cssH': computedRoot?.height || 'N/A',
        'main H': appMain ? `${appMain.clientHeight}px` : 'N/A',
        'main scrollH': appMain ? `${appMain.scrollHeight}px` : 'N/A',
        'main cssH': computedApp?.height || 'N/A',
        'main PT': computedApp?.paddingTop || 'N/A',
        'main PB': computedApp?.paddingBottom || 'N/A',
        'mini H': mini ? `${mini.clientHeight}px` : 'N/A',
        'mini PB': mini ? getComputedStyle(mini).paddingBottom : 'N/A',
        'mini bottom': mini ? getComputedStyle(mini).bottom : 'N/A',
        'body scrollH': `${document.body.scrollHeight}px`,
        'body clientH': `${document.body.clientHeight}px`,
        'doc EL clientH': `${document.documentElement.clientHeight}px`,
      });
    }

    measure();
    window.addEventListener('resize', measure);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measure);
    }
    const timer = setInterval(measure, 1000);
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none text-[10px] font-mono leading-tight"
      style={{ fontFamily: 'monospace' }}
    >
      {/* 尺寸信息面板 - 左上角 */}
      <div className="absolute top-2 left-2 bg-red-600/90 text-white p-2 rounded max-w-[280px] shadow-lg">
        <div className="font-bold text-xs mb-1">🔍 DEBUG INFO (tap to dismiss parent)</div>
        {Object.entries(info).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-yellow-200">{k}</span>
            <span className="text-white">{v}</span>
          </div>
        ))}
      </div>

      {/* #root 边界 - 绿色 */}
      <div
        className="absolute border-2 border-green-400"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      />

      {/* 标注 safe-area-bottom 区域 - 红色半透明 */}
      <div
        className="absolute left-0 right-0 bg-red-500/30"
        style={{
          bottom: 0,
          height: 'env(safe-area-inset-bottom)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
