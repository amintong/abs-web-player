/**
 * 极简调试模式 — 一键开关
 *
 * 开启后：页面组件直接显示彩色边框 + 尺寸标签
 * 关闭后：零侵入，无任何残留
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

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

  // 调试模式开启时注册并监听尺寸
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
      {/* 标签 */}
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
    </Ctx.Provider>
  );
}
