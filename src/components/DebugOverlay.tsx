import { useState, useEffect, useCallback } from 'react';
import { subscribeLogs, LogEntry } from '../utils/playerLogger';

/**
 * iOS PWA 调试工具
 * 1. 尺寸诊断面板（底部空白问题）
 * 2. 播放器日志（锁屏恢复/片头跳转等 bug）
 * 3. 一键复制全部信息
 */
export default function DebugOverlay() {
  const [sizeInfo, setSizeInfo] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 订阅播放器日志
    const unsub = subscribeLogs((l) => setLogs(l));

    function measure() {
      const vv = window.visualViewport;
      const root = document.getElementById('root');
      const appMain = document.querySelector('[class*="overflow-y-auto"]') as HTMLElement;
      const mini = document.querySelector('[class*="fixed"][class*="bottom-0"]') as HTMLElement;

      const computedRoot = root ? getComputedStyle(root) : null;
      const computedApp = appMain ? getComputedStyle(appMain) : null;

      const appHeight = getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim();
      const vhVar = getComputedStyle(document.documentElement).getPropertyValue('--vh').trim();
      const safeTop = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top').trim();
      const safeBottom = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom').trim();

      setSizeInfo({
        'screen': `${screen.width}x${screen.height}`,
        'window.iH': `${window.innerHeight}px`,
        'vv.height': vv ? `${vv.height}px` : 'N/A',
        'vv.offsetTop': vv ? `${vv.offsetTop}px` : 'N/A',
        '--app-height': appHeight || '(not set)',
        '--vh': vhVar || '(not set)',
        'safe-top': safeTop || '0',
        'safe-bottom': safeBottom || '0',
        '#root H': root ? `${root.clientHeight}px` : 'N/A',
        '#root cssH': computedRoot?.height || 'N/A',
        'main H': appMain ? `${appMain.clientHeight}px` : 'N/A',
        'main scrollH': appMain ? `${appMain.scrollHeight}px` : 'N/A',
        'main cssH': computedApp?.height || 'N/A',
        'main PT': computedApp?.paddingTop || 'N/A',
        'main PB': computedApp?.paddingBottom || 'N/A',
        'mini H': mini ? `${mini.clientHeight}px` : 'N/A',
        'mini PB': mini ? getComputedStyle(mini).paddingBottom : 'N/A',
        'body scrollH': `${document.body.scrollHeight}px`,
      });
    }

    measure();
    window.addEventListener('resize', measure);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measure);
    }
    return () => {
      unsub();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const lines: string[] = [];
    lines.push('===== iOS PWA DEBUG REPORT =====');
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`UA: ${navigator.userAgent.slice(-80)}`);
    lines.push('');

    // 尺寸信息
    lines.push('----- SIZE INFO -----');
    for (const [k, v] of Object.entries(sizeInfo)) {
      lines.push(`  ${k}: ${v}`);
    }
    lines.push('');

    // 最近日志（最后 100 条）
    const recentLogs = logs.slice(-100);
    lines.push(`----- PLAYER LOGS (${recentLogs.length} entries) -----`);
    for (const e of recentLogs) {
      const dataStr = e.data ? ` ${JSON.stringify(e.data)}` : '';
      lines.push(`  [${e.timestamp}] [${e.level}] [${e.module}] ${e.message}${dataStr}`);
    }

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: 用 textarea 复制
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [sizeInfo, logs]);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none font-mono text-[10px] leading-tight">
      {/* ====== 左上角：尺寸信息 ====== */}
      <div className="absolute top-1 left-1 right-1 max-h-[40vh] overflow-y-auto bg-red-600/95 text-white p-1.5 rounded shadow-lg pointer-events-auto">
        <div className="font-bold text-xs mb-1 flex items-center justify-between">
          <span>📏 SIZE INFO</span>
          <button
            onClick={handleCopy}
            className="text-[9px] bg-white text-red-600 px-1.5 py-0.5 rounded font-bold active:scale-95"
          >
            {copied ? '✅ COPIED!' : '📋 COPY ALL'}
          </button>
        </div>
        {Object.entries(sizeInfo).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-yellow-200 shrink-0">{k}</span>
            <span className="text-white font-medium">{v}</span>
          </div>
        ))}
      </div>

      {/* ====== 左下角：播放器日志（最近30条） ====== */}
      <div className="absolute bottom-1 left-1 right-1 max-h-[45vh] overflow-y-auto bg-black/95 text-white p-1.5 rounded shadow-lg pointer-events-auto hide-scrollbar">
        <div className="font-bold text-xs mb-1 sticky top-0 bg-black pb-1">
          📜 PLAYER LOGS (last 30)
        </div>
        {logs.slice(-30).reverse().map((e) => (
          <div
            key={e.id}
            className={`py-0.5 px-0.5 rounded ${
              e.level === 'warn' ? 'bg-yellow-900/60 text-yellow-200' :
              e.level === 'error' ? 'bg-red-900/60 text-red-200' :
              e.message.includes('⚠️') ? 'bg-orange-900/50 text-orange-200' :
              'text-gray-300'
            }`}
          >
            <span className="text-gray-500">[{e.timestamp.slice(0, 8)}]</span>{' '}
            <span className={`${
              e.module === 'background' ? 'text-cyan-300' :
              e.module === 'chapter' ? 'text-green-300' :
              e.module === 'session' ? 'text-purple-300' :
              e.module === 'play' ? 'text-blue-300' :
              ''
            }`}>[{e.module}]</span>{' '}
            {e.message}
            {e.data && (
              <span className="text-gray-500 ml-1">{JSON.stringify(e.data)}</span>
            )}
          </div>
        ))}
        {logs.length === 0 && <div className="text-gray-500 italic">No logs yet</div>}
      </div>

      {/* ====== 视觉标注 ====== */}
      {/* #root 边界 - 绿色 */}
      <div className="absolute inset-0 border-2 border-green-400" style={{ pointerEvents: 'none' }} />
      {/* safe-area-bottom 红色半透明 */}
      <div
        className="absolute left-0 right-0 bg-red-500/30"
        style={{ bottom: 0, height: 'env(safe-area-inset-bottom)', pointerEvents: 'none' }}
      />
    </div>
  );
}
