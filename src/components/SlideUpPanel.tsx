import { useEffect, useRef, useState, type ReactNode } from 'react';

interface SlideUpPanelProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export default function SlideUpPanel({ visible, onClose, children, title }: SlideUpPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const canDrag = useRef(false); // 是否允许面板下拉（区分内层滚动）
  const [translateY, setTranslateY] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (visible) {
      setTranslateY(0);
      setIsAnimating(false);
    }
  }, [visible]);

  if (!visible) return null;

  /** 查找最近的可滚动祖先 */
  function findScrollParent(el: HTMLElement | null): HTMLElement | null {
    while (el && el !== panelRef.current) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const style = getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    isDragging.current = true;
    setIsAnimating(false);

    // 判断触摸点是否在可滚动区域内
    const scrollEl = findScrollParent(e.target as HTMLElement);
    if (scrollEl && scrollEl.scrollTop > 0) {
      // 内层列表未滚到顶部 → 不允许面板下拉
      canDrag.current = false;
    } else {
      canDrag.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const diff = touch.clientY - startY.current;

    // 如果初始判定不可拖，检查内层是否已滚到顶
    if (!canDrag.current) {
      const scrollEl = findScrollParent(e.target as HTMLElement);
      if (scrollEl && scrollEl.scrollTop <= 0 && diff > 0) {
        // 内层已滚到顶 + 用户继续下拉 → 切换为允许面板下拉
        canDrag.current = true;
        startY.current = touch.clientY; // 重置起点
      } else {
        return; // 让内层继续滚动
      }
    }

    if (diff < 0) return; // 向上滑不处理
    currentY.current = touch.clientY;
    setTranslateY(diff * 0.6);
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (!canDrag.current) {
      canDrag.current = false;
      return;
    }

    const diff = currentY.current - startY.current;
    const threshold = 80;
    setIsAnimating(true);

    if (diff > threshold) {
      setTranslateY(400);
      setTimeout(() => onClose(), 200);
    } else {
      setTranslateY(0);
      setTimeout(() => setIsAnimating(false), 250);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full bg-[var(--color-bg-secondary)] rounded-t-3xl p-4"
        style={{
          paddingBottom: '0px',
          transform: `translateY(${translateY}px)`,
          transition: isAnimating ? 'transform 0.25s ease' : 'none',
        }}
      >
        {/* 拖拽指示器 */}
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing" />
        {title && (
          <h3 className="text-lg font-semibold text-[var(--color-text)] text-center mb-4">{title}</h3>
        )}
        {children}
      </div>
    </div>
  );
}
