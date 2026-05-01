/**
 * 开发者调试控制台 — DebugConsole
 *
 * 功能：
 * 1. 浮动按钮开关（右下角 bug 图标）
 * 2. 组件边界标注（彩色边框 + 名称标签）
 * 3. 组件树面板（点击聚焦、显示尺寸）
 * 4. 尺寸诊断信息（iOS PWA 底部空白排查）
 * 5. 播放器运行日志（锁屏恢复/片头跳转等）
 * 6. 一键复制全部调试信息
 *
 * 使用方式：在 App.tsx 中用 <DebugConsole> 包裹路由和关键组件
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { subscribeLogs, LogEntry } from '../utils/playerLogger';

// ====== 类型 ======

interface SizeInfo { [key: string]: string; }

interface RegisteredComponent {
  id: string;
  name: string;
  ref: HTMLElement | null;
  color: string;
  colorIndex: number;
}

// ====== Context：组件自注册 ======

const DebugCtx = createContext<{
  enabled: boolean;
  register: (id: string, name: string, el: HTMLElement | null) => void;
  unregister: (id: string) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  registered: RegisteredComponent[];
}>({
  enabled: false,
  register: () => {},
  unregister: () => {},
  focusedId: null,
  setFocusedId: () => {},
  registered: [],
});

/** 给子组件用的 hook：注册自己到调试系统 */
export function useDebugRegister(id: string, name: string) {
  const ctx = useContext(DebugCtx);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx.enabled || !ref.current) return;
    // 延迟一帧确保 DOM 就位
    const raf = requestAnimationFrame(() => ctx.register(id, name, ref.current));
    return () => {
      cancelAnimationFrame(raf);
      ctx.unregister(id);
    };
  }, [ctx.enabled, id, name]);

  return ref;
}

// ====== 颜色池（用于区分不同组件） ======

const COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#84cc16', // lime
  '#6366f1', // indigo
];

function getColor(index: number): string {
  return COLORS[index % COLORS.length];
}

// ====== 调试标签包裹组件（给每个注册的组件加边框+名称标签）=====

interface DebugLabelProps {
  id: string;
  name: string;
  children: React.ReactNode;
}

function DebugLabel({ id, name, children }: DebugLabelProps) {
  const ctx = useContext(DebugCtx);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const isFocused = ctx.focusedId === id;

  useEffect(() => {
    if (!ctx.enabled || !ref.current) return;
    const raf = requestAnimationFrame(() => ctx.register(id, name, ref.current));

    // 尺寸观察器
    let ro: ResizeObserver | null = null;
    if (ctx.enabled && ref.current) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setSize({ w: Math.round(width), h: Math.round(height) });
        }
      });
      ro.observe(ref.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      ctx.unregister(id);
    };
  }, [ctx.enabled, id, name]);

  if (!ctx.enabled) return <>{children}</>;

  return (
    <div
      ref={ref}
      className="relative"
      style={{ outline: `2px solid ${isFocused ? '#fff' : 'rgba(255,255,255,0.25)'}`, outlineOffset: -1 }}
      onClick={(e) => {
        e.stopPropagation();
        ctx.setFocusedId(isFocused ? null : id);
        ctx.register(id, name, ref.current); // 点击时刷新位置信息
      }}
      data-debug-id={id}
      data-debug-name={name}
    >
      {/* 组件名称标签 */}
      <div
        className="absolute z-[10001] text-[9px] font-mono px-1 py-0.5 rounded pointer-events-none select-none leading-tight"
        style={{
          top: -18,
          left: 0,
          background: getColor(ctx.registered?.find((c: RegisteredComponent) => c.id === id)?.colorIndex ?? 0),
          color: '#000',
          fontWeight: 700,
          fontSize: '9px',
          whiteSpace: 'nowrap',
          opacity: isFocused ? 1 : 0.7,
        }}
      >
        {name}
        {size && (
          <span className="ml-1 opacity-70">{size.w}×{size.h}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ====== 主控制台组件 ======

export default function DebugConsole({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [panelTab, setPanelTab] = useState<'components' | 'size' | 'logs'>('components');
  const [components, setComponents] = useState<RegisteredComponent[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sizeInfo, setSizeInfo] = useState<SizeInfo>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const compMapRef = useRef<Map<string, RegisteredComponent>>(new Map());
  const colorIndexRef = useRef(0);

  // 注册组件
  const register = useCallback((id: string, name: string, el: HTMLElement | null) => {
    const map = compMapRef.current;
    const existing = map.get(id);
    if (existing) {
      existing.ref = el;
      setComponents(prev => prev.map(c => c.id === id ? { ...c, ref: el } : c));
      return;
    }
    const idx = colorIndexRef.current++;
    const comp: RegisteredComponent = { id, name, ref: el, color: getColor(idx), colorIndex: idx };
    map.set(id, comp);
    setComponents(prev => [...prev, comp]);
  }, []);

  const unregister = useCallback((id: string) => {
    compMapRef.current.delete(id);
    setComponents(prev => prev.filter(c => c.id !== id));
  }, []);

  // ---- 订阅日志 ----
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeLogs((l) => setLogs(l));
    return unsub;
  }, [enabled]);

  // ---- 尺寸测量 ----
  useEffect(() => {
    if (!enabled) return;
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
        'main PT': computedApp?.paddingTop || 'N/A',
        'main PB': computedApp?.paddingBottom || 'N/A',
        'mini H': mini ? `${mini.clientHeight}px` : 'N/A',
        'mini PB': mini ? getComputedStyle(mini).paddingBottom : 'N/A',
        'body scrollH': `${document.body.scrollHeight}px`,
      });
    }
    measure();
    window.addEventListener('resize', measure);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [enabled]);

  // ---- 复制全部 ----
  const handleCopyAll = useCallback(async () => {
    const lines: string[] = [];
    lines.push(`===== DEBUG REPORT =====`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`UA: ${navigator.userAgent.slice(-80)}`);
    lines.push('');

    lines.push('----- COMPONENTS -----');
    for (const c of components) {
      const el = c.ref;
      lines.push(`  ${c.name}: ${el ? `${el.clientWidth}×${el.clientHeight}` : '(not mounted)'}`);
    }
    lines.push('');

    lines.push('----- SIZE INFO -----');
    for (const [k, v] of Object.entries(sizeInfo)) {
      lines.push(`  ${k}: ${v}`);
    }
    lines.push('');

    const recentLogs = logs.slice(-100);
    lines.push(`----- LOGS (${recentLogs.length}) -----`);
    for (const e of recentLogs) {
      lines.push(`  [${e.timestamp}] [${e.level}] [${e.module}] ${e.message}${e.data ? ` ${JSON.stringify(e.data)}` : ''}`);
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = lines.join('\n');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [components, sizeInfo, logs]);

  // 聚焦组件的信息
  const focusedComp = components.find(c => c.id === focusedId);
  const focusedEl = focusedComp?.ref;

  const ctxValue = { enabled, register, unregister, focusedId, setFocusedId, registered: components };

  return (
    <DebugCtx.Provider value={ctxValue}>
      {children}

      {/* ====== 浮动按钮（始终可见） ====== */}
      <button
        onClick={() => setEnabled(e => !e)}
        className={`fixed z-[99999] w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg transition-all active:scale-90 ${
          enabled ? 'bg-red-500 text-white' : 'bg-gray-800/80 text-gray-300 backdrop-blur'
        }`}
        style={{ right: 12, bottom: enabled ? 220 : 12 }}
      >
        {enabled ? '✕' : '🐛'}
      </button>

      {!enabled ? null : (
        <>
          {/* ====== 调试面板 ====== */}
          <div
            className="fixed z-[99998] bg-gray-900/98 backdrop-blur text-white rounded-t-xl shadow-2xl overflow-hidden font-mono"
            style={{
              right: 8,
              bottom: 68,
              width: Math.min(360, window.innerWidth - 16),
              maxHeight: '60vh',
              transition: 'max-height 0.2s',
            }}
          >
            {/* 面板头部 */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 shrink-0">
              <span className="text-xs font-bold text-gray-300">DEBUG CONSOLE</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopyAll}
                  className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded active:scale-95"
                >
                  {copied ? '✅' : '📋 Copy'}
                </button>
                <button
                  onClick={() => setPanelOpen(o => !o)}
                  className="text-[10px] bg-gray-600 text-white px-2 py-0.5 rounded"
                >
                  {panelOpen ? '▼' : '▲'}
                </button>
              </div>
            </div>

            {panelOpen && (
              <>
                {/* Tab 切换 */}
                <div className="flex gap-0.5 px-3 pt-1.5 pb-0 bg-gray-850 shrink-0">
                  {(['components', 'size', 'logs'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setPanelTab(tab)}
                      className={`text-[10px] px-2 py-0.5 rounded-t capitalize ${
                        panelTab === tab
                          ? 'bg-gray-700 text-white font-bold'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {tab === 'components' ? `📦 (${components.length})` :
                       tab === 'size' ? '📏' : '📜'}
                    </button>
                  ))}
                </div>

                {/* Tab 内容 */}
                <div className="overflow-y-auto hide-scrollbar" style={{ maxHeight: 'calc(60vh - 70px)' }}>
                  {/* --- 组件列表 --- */}
                  {panelTab === 'components' && (
                    <div className="p-2 space-y-1">
                      {components.length === 0 && (
                        <div className="text-gray-500 text-[10px] italic">No components registered</div>
                      )}
                      {components.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setFocusedId(focusedId === c.id ? null : c.id)}
                          className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                            focusedId === c.id
                              ? 'bg-gray-600 text-white'
                              : 'hover:bg-gray-800 text-gray-300'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: c.color }}
                          />
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="text-gray-500 text-[9px]">
                            {c.ref ? `${c.ref.clientWidth}×${c.ref.clientHeight}` : '--'}
                          </span>
                        </button>
                      ))}

                      {/* 聚焦组件详情 */}
                      {focusedComp && focusedEl && (
                        <div className="mt-2 p-2 bg-gray-800 rounded text-[10px] space-y-1 border border-gray-700">
                          <div className="font-bold text-yellow-300">🔍 {focusedComp.name}</div>
                          <div className="grid grid-cols-2 gap-x-3">
                            <span className="text-gray-400">size:</span>
                            <span>{focusedEl.clientWidth} × {focusedEl.clientHeight}</span>
                            <span className="text-gray-400">scroll:</span>
                            <span>{focusedEl.scrollWidth} × {focusedEl.scrollHeight}</span>
                            <span className="text-gray-400">offset:</span>
                            <span>{focusedEl.offsetLeft}, {focusedEl.offsetTop}</span>
                            <span className="text-gray-400">clientRect:</span>
                            <span>{(() => { const r = focusedEl.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`; })()}</span>
                            <span className="text-gray-400">overflow:</span>
                            <span>{getComputedStyle(focusedEl).overflow}</span>
                            <span className="text-gray-400">display:</span>
                            <span>{getComputedStyle(focusedEl).display}</span>
                            <span className="text-gray-400">height:</span>
                            <span>{getComputedStyle(focusedEl).height}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- 尺寸信息 --- */}
                  {panelTab === 'size' && (
                    <div className="p-2 space-y-0.5">
                      {Object.entries(sizeInfo).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[11px]">
                          <span className="text-yellow-200 shrink-0">{k}</span>
                          <span className="text-white font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- 日志 --- */}
                  {panelTab === 'logs' && (
                    <div className="p-2 space-y-0.5">
                      {logs.length === 0 && (
                        <div className="text-gray-500 text-[10px] italic">No logs yet</div>
                      )}
                      {logs.slice(-50).reverse().map(e => (
                        <div
                          key={e.id}
                          className={`py-0.5 px-1 rounded text-[10px] ${
                            e.level === 'warn' ? 'bg-yellow-900/50 text-yellow-200' :
                            e.level === 'error' ? 'bg-red-900/50 text-red-200' :
                            e.message.includes('⚠️') ? 'bg-orange-900/40 text-orange-200' :
                            'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-600 mr-1">[{e.timestamp.slice(0, 8)}]</span>
                          <span className={
                            e.module === 'background' ? 'text-cyan-400' :
                            e.module === 'chapter' ? 'text-green-400' :
                            e.module === 'session' ? 'text-purple-400' :
                            e.module === 'play' ? 'text-blue-400' :
                            ''
                          }>[{e.module}]</span>{' '}
                          {e.message}
                          {e.data && <span className="text-gray-500 ml-1 text-[9px]">{JSON.stringify(e.data)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 视觉标注层（safe-area 红色区域） */}
          <div
            className="fixed left-0 right-0 bg-red-500/20 pointer-events-none z-[99997]"
            style={{
              bottom: 0,
              height: 'env(safe-area-inset-bottom)',
            }}
          />
        </>
      )}
    </DebugCtx.Provider>
  );
}

// 导出 DebugLabel 供外部使用
export { DebugLabel };
