import { useState } from 'react';
import { Headphones } from 'lucide-react';

/** 封面图组件 — 加载失败时显示默认占位 */
export default function CoverImage({ src, alt, className }: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-purple-900/60 to-gray-900 ${className || ''}`}>
        <Headphones className="w-1/3 h-1/3 text-purple-400/40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || ''}
      className={className || ''}
      onError={() => setFailed(true)}
    />
  );
}
