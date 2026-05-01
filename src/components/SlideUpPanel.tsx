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
  const [translateY, setTranslateY] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (visible) {
      setTranslateY(0);
      setIsAnimating(false);
    }
  }, [visible]);

  if (!visible) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    // 只允许从面板顶部区域开始拖动
    const touch = e.touches[0];
    startY.current = touch.clientY;
    currentY.current = touch.clientY;
    isDragging.current = true;
    setIsAnimating(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const diff = touch.clientY - startY.current;
    if (diff < 0) return; // 向上滑不处理
    currentY.current = touch.clientY;
    // 跟随手指移动，带阻尼效果
    setTranslateY(diff * 0.6);
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const diff = currentY.current - startY.current;
    const threshold = 80;
    setIsAnimating(true);

    if (diff > threshold) {
      // 超过阈值，关闭
      setTranslateY(400);
      setTimeout(() => onClose(), 200);
    } else {
      // 弹回原位
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
        className="relative w-full bg-gray-900 rounded-t-3xl p-4"
        style={{
          paddingBottom: '0px',
          transform: `translateY(${translateY}px)`,
          transition: isAnimating ? 'transform 0.25s ease' : 'none',
        }}
      >
        {/* 拖拽指示器 */}
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing" />
        {title && (
          <h3 className="text-lg font-semibold text-white text-center mb-4">{title}</h3>
        )}
        {children}
      </div>
    </div>
  );
}
