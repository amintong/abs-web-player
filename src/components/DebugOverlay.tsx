/**
 * 极简调试模式 — 一键开关
 *
 * 开启后：
 *   1. 页面组件显示彩色边框 + 尺寸标签（标签在内部左上角，不被裁）
 *   2. 左上角实时日志浮窗（最近30条，透明背景）
 *   3. fixed 定位的组件通过 useDebugCtx 自行渲染标签
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { subscribeLogs, LogEntry } from '../utils/playerLogger';

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

/** 给普通子组件用 */
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
      {/* 标签在内部左上角，不被父级 overflow 裁剪 */}
      <span
        className="absolute z-[99999] text-[11px] font-mono font-bold px-1.5 py-0.5 rounded pointer-events-none select-none leading-none whitespace-nowrap"
        style={{ background: c, color: '#000', top: 0, left: 0 }}
      >
        {name} {size.w > 0 && size.h > 0 && <span className="opacity-70">{size.w}×{size.h}</span>}
      </span>
      {children}
    </div>
  );
}

/** 给 fixed 定位组件用（如 MiniPlayer）—— 返回是否开启 + 颜色，组件自行画标签 */
export function useDebugLabel(id: string, name: string) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const c = colorFor(id);

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
  }, [ctx.on]);

  return { on: ctx.on, color: c, size, ref };
}

/** 实时日志浮窗 */
function DebugLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { return subscribeLogs((all) => setLogs(all.slice(-30))); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'instant' }); }, [logs.length > 0 ? logs[logs.length - 1].id : 0]);

  function fmt(e: LogEntry) {
    const d = e.data ? ' ' + JSON.stringify(e.data).slice(0, 120) : '';
    const w = e.level === 'warn' || e.level === 'error';
    return `[${e.timestamp}] ${w ? '⚠️' : ''}[${e.module}] ${e.message}${d}`;
  }

  return (
    <div className="fixed z-[99998] left-2 top-12 w-[min(92vw,480px)] max-h-[35vh]" style={{ background: 'transparent' }}>
      <div className="text-[10px] font-mono px-2 py-1 font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>
        LOGS ({logs.length})
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(35vh - 24px)' }}>
        {logs.length === 0 && <div className="text-[10px] font-mono px-2" style={{ color: 'rgba(255,255,255,0.2)' }}>waiting...</div>}
        {logs.map(e => (
          <pre key={e.id}
            className="text-[10px] font-mono leading-tight whitespace-pre-wrap break-all m-0 p-1"
            style={{
              color: e.level === 'warn' ? 'rgba(251,191,36,.85)' : e.level === 'error' ? 'rgba(248,113,113,.85)' : 'rgba(255,255,255,.45)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              textShadow: '0 1px 3px rgba(0,0,0,.8)',
            }}
          >{fmt(e)}</pre>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function DebugMode({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const mapRef = useRef<Map<string, CompInfo>>(new Map());

  const register = useCallback((id: string, name: string, el: HTMLElement | null) => {
    const m = mapRef.current;
    if (m.has(id)) { const c = m.get(id)!; c.el = el; m.set(id, c); return; }
    m.set(id, { id, name, el, color: colorFor(id) });
  }, []);

  const unregister = useCallback((id: string) => { mapRef.current.delete(id); }, []);

  return (
    <Ctx.Provider value={{ on, register, unregister }}>
      {children}

      <button
        onClick={() => setOn(v => !v)}
        className={`fixed z-[99999] w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg active:scale-90 transition-colors ${
          on ? 'bg-red-500 text-white' : 'bg-gray-800/80 text-gray-300 backdrop-blur'
        }`}
        style={{ right: 12, bottom: 12 }}
      >
        {on ? '✕' : '🐛'}
      </button>

      {on && <DebugLogPanel />}
    </Ctx.Provider>
  );
}
