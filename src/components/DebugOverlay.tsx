/**
 * 极简调试模式 — 一键开关
 *
 * 开启后：
 *   1. 页面组件显示彩色边框 + 尺寸标签
 *   2. 左下角实时日志浮窗（最近30条，自动滚底）
 * 关闭后：零侵入，无任何残留
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { subscribeLogs, LogEntry } from '../utils/playerLogger';

interface CompInfo { id: string; name: string; el: HTMLElement | null; color: string }

const Ctx = createContext<{ on: boolean; register: (id: string, name: string, el: HTMLElement | null) => void; unregister: (id: string) => void }>({
  on: false, register: () => {}, unregister: () => {},
});

const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#ec4899','#84cc16','#6366f1'];

function colorFor(id: string): string {
  return COLORS[id.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLORS.length];
}

/** 给子组件用：包裹后开启调试时显示边框+标签 */
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

  return (
    <div ref={ref} style={{ outline: `2px solid ${colorFor(id)}`, outlineOffset: -1 }} data-did={id}>
      <span
        className="absolute -top-4 left-0 z-[99999] text-[9px] font-mono font-bold px-1 py-px rounded pointer-events-none select-none leading-none"
        style={{ background: colorFor(id), color: '#000', whiteSpace: 'nowrap' }}
      >
        {name} {size.w > 0 && <span className="opacity-60">{size.w}×{size.h}</span>}
      </span>
      {children}
    </div>
  );
}

/** 实时日志浮窗（仅调试模式） */
function DebugLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeLogs((all) => setLogs(all.slice(-30)));
  }, []);

  // 自动滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [logs.length > 0 ? logs[logs.length - 1].id : 0]);

  function formatEntry(e: LogEntry) {
    const dataStr = e.data ? ' ' + JSON.stringify(e.data).slice(0, 120) : '';
    const isWarn = e.level === 'warn' || e.level === 'error';
    return `[${e.timestamp}] ${isWarn ? '⚠️' : ''}[${e.module}] ${e.message}${dataStr}`;
  }

  return (
    <div
      className="fixed z-[99998] left-2 bottom-2 w-[min(92vw,480px)] max-h-[40vh] rounded-lg overflow-hidden shadow-xl"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono font-bold border-b border-white/10" style={{ color: '#9ca3af' }}>
        <span>📜 PLAYER LOGS ({logs.length})</span>
      </div>
      {/* 日志列表 */}
      <div className="overflow-y-auto p-2 space-y-0.5" style={{ maxHeight: 'calc(40vh - 32px)' }}>
        {logs.length === 0 && (
          <div className="text-[10px] font-mono" style={{ color: '#6b7280' }}>等待日志...</div>
        )}
        {logs.map(e => (
          <pre
            key={e.id}
            className="text-[10px] font-mono leading-tight whitespace-pre-wrap break-all m-0"
            style={{
              color: e.level === 'warn' ? '#fbbf24' : e.level === 'error' ? '#f87171' : '#d1d5db',
              padding: '1px 0',
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          >
            {formatEntry(e)}
          </pre>
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
    if (m.has(id)) {
      const c = m.get(id)!;
      c.el = el;
      m.set(id, c);
      return;
    }
    m.set(id, { id, name, el, color: colorFor(id) });
  }, []);

  const unregister = useCallback((id: string) => {
    mapRef.current.delete(id);
  }, []);

  return (
    <Ctx.Provider value={{ on, register, unregister }}>
      {children}

      {/* 悬浮按钮 */}
      <button
        onClick={() => setOn(v => !v)}
        className={`fixed z-[99999] w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg active:scale-90 transition-colors ${
          on ? 'bg-red-500 text-white' : 'bg-gray-800/80 text-gray-300 backdrop-blur'
        }`}
        style={{ right: 12, bottom: 12 }}
      >
        {on ? '✕' : '🐛'}
      </button>

      {/* 实时日志 */}
      {on && <DebugLogPanel />}
    </Ctx.Provider>
  );
}
