/**
 * 极简调试模式 — 一键开关
 *
 * 开启后：
 *   1. 普通组件：DebugTag 包裹 → 彩色边框 + 内部标签 + 尺寸
 *   2. 左上角透明日志浮窗
 *   3. 右上角尺寸诊断面板（关键布局数据，用于排查空白问题）
 *
 * fixed 定位组件（如 MiniPlayer）不包裹 DebugTag，由诊断面板显示其位置。
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { subscribeLogs, LogEntry } from '../utils/playerLogger';
import { useAppStore } from '../store/appStore';

interface CompInfo { id: string; name: string; el: HTMLElement | null; color: string }

const Ctx = createContext<{
  on: boolean;
  register: (id: string, name: string, el: HTMLElement | null) => void;
  unregister: (id: string) => void;
}>({
  on: false, register: () => {}, unregister: () => {},
});

const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#6366f1'];

function colorFor(id: string): string {
  return COLORS[id.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLORS.length];
}

/** 给普通流式组件用 */
export function DebugTag({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ctx.on || !ref.current) return;
    const raf = requestAnimationFrame(() => ctx.register(id, name, ref.current));
    let ro: ResizeObserver | null = null;
    if (ref.current) {
      ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const { width, height } = e.contentRect;
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
  }, [ctx.on, id, name]);

  if (!ctx.on) return <>{children}</>;

  const c = colorFor(id);

  return (
    <div ref={ref} className="relative" style={{ border: `2px solid ${c}`, minHeight: 4 }} data-did={id}>
      <span
        className="absolute text-[11px] font-mono font-bold px-1.5 py-0.5 rounded pointer-events-none select-none leading-none whitespace-nowrap z-10"
        style={{ background: c, color: '#000', top: 0, left: 0 }}
      >
        {name} {size.w > 0 && size.h > 0 && <span className="opacity-70">{size.w}×{size.h}</span>}
      </span>
      {children}
    </div>
  );
}

/** 尺寸诊断面板 — 用于排查底部空白等布局问题 */
function DiagPanel() {
  const [info, setInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    function collect() {
      const vv = window.visualViewport;
      const root = document.getElementById('root');
      const main = root?.querySelector('[class*="overflow-y-auto"]') || root?.firstElementChild;
      const mini = document.querySelector('[data-miniplayer]') as HTMLElement | null;

      const s = window.screen;
      // 从 CSS 变量读取安全区值（main.tsx 已将 env() 结果写入 --safe-top / --safe-bottom）
      const cs = getComputedStyle(document.documentElement);
      const safeTop    = cs.getPropertyValue('--safe-top').trim() || '?';
      const safeBottom = cs.getPropertyValue('--safe-bottom').trim() || '?';

      let miniRect: string = 'N/A';
      let gapBottom: string = 'N/A';
      if (mini) {
        const r = mini.getBoundingClientRect();
        miniRect = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
        const screenH = s.height || window.innerHeight;
        gapBottom = `${Math.round(screenH - (r.y + r.height))}px`;
      }

      setInfo({
        screen: `${s.width}×${s.height}`,
        winIH: `${window.innerHeight}px`,
        vvH: vv ? `${vv.height}px` : '?',
        vvOffsetT: vv ? `${vv.offsetTop}px` : '?',
        safeT: safeTop === '0px' ? '~59px(估)' : safeTop,
        safeB: safeBottom === '0px' ? '~34px(估)' : safeBottom,
        rootH: root ? `${root.clientHeight}px` : '?',
        mainH: main ? `${main.clientHeight}px` : '?',
        mainPT: main ? getComputedStyle(main).paddingTop : '?',
        mainPB: main ? getComputedStyle(main).paddingBottom : '?',
        miniRect,
        gapBottom,
        bodyBH: `${document.body.scrollHeight}px`,
      });
    }

    collect(); // 立即执行一次
    const id = setInterval(collect, 1000);
    return () => clearInterval(id);
  }, []);

  const rows = [
    ['screen', info.screen],
    ['window.iH', info.winIH],
    ['vv.height', info.vvH],
    ['vv.offsetTop', info.vvOffsetT],
    ['safe-top', info.safeT],
    ['safe-bottom', info.safeB],
    ['#root H', info.rootH],
    ['main H', info.mainH],
    ['main PT', info.mainPT],
    ['main PB', info.mainPB],
    ['mini rect', info.miniRect],
    ['⚠️ gap-bottom', info.gapBottom],
    ['body.scrollH', info.bodyBH],
  ];

  return (
    <div className="fixed z-[99998] right-2 top-12 max-w-[280px] rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}>
      <div className="text-[10px] font-mono font-bold px-2 py-1 border-b border-white/10" style={{ color: 'rgba(156,163,175,1)' }}>DIAG</div>
      <div className="p-1.5 space-y-px">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[10px] font-mono">
            <span style={{ color: k.startsWith('⚠️') ? '#fbbf24' : 'rgba(156,163,175,1)' }}>{k}</span>
            <span style={{ color: 'rgba(209,213,219,1)' }}>{v || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 日志浮窗 */
function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bot = useRef<HTMLDivElement>(null);

  useEffect(() => { return subscribeLogs(a => setLogs(a.slice(-20))); }, []);
  useEffect(() => { bot.current?.scrollIntoView({ behavior: 'instant' }); }, [logs.length > 0 ? logs[logs.length - 1].id : 0]);

  function fmt(e: LogEntry) {
    const d = e.data ? ' ' + JSON.stringify(e.data).slice(0, 100) : '';
    const w = e.level === 'warn' || e.level === 'error';
    return `[${e.timestamp}] ${w ? '⚠️' : ''}[${e.module}] ${e.message}${d}`;
  }

  return (
    <div className="fixed z-[99998] left-2 top-12 w-[min(88vw,400px)] max-h-[30vh]" style={{ background: 'transparent' }}>
      <div className="text-[10px] font-mono px-2 py-0.5 font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
        LOGS ({logs.length})
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(30vh - 22px)' }}>
        {!logs.length && <div className="text-[10px] font-mono px-2" style={{ color: 'rgba(255,255,255,0.2)' }}>...</div>}
        {logs.map(e => (
          <pre key={e.id} className="text-[10px] font-mono leading-tight whitespace-pre-wrap break-all m-0 p-0.5"
            style={{
              color: e.level === 'warn' ? 'rgba(251,191,36,.85)' : e.level === 'error' ? 'rgba(248,113,113,.85)' : 'rgba(255,255,255,.45)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              textShadow: '0 1px 3px rgba(0,0,0,.8)',
            }}
          >{fmt(e)}</pre>
        ))}
        <div ref={bot} />
      </div>
    </div>
  );
}

export default function DebugMode({ children }: { children: React.ReactNode }) {
  const debugMode = useAppStore((s) => s.debugMode);
  const mapRef = useRef<Map<string, CompInfo>>(new Map());

  const register = useCallback((id: string, name: string, el: HTMLElement | null) => {
    const m = mapRef.current;
    if (m.has(id)) { const c = m.get(id)!; c.el = el; m.set(id, c); return; }
    m.set(id, { id, name, el, color: colorFor(id) });
  }, []);

  const unregister = useCallback((id: string) => { mapRef.current.delete(id); }, []);

  return (
    <Ctx.Provider value={{ on: debugMode, register, unregister }}>
      {children}

      {debugMode && (
        <>
          <DiagPanel />
          <LogPanel />
        </>
      )}
    </Ctx.Provider>
  );
}
