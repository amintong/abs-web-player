import { useCallback } from 'react';

/** 统一 Slider 组件 — 无白色圆圈 thumb，带渐变进度条 */
export default function Slider({
  value,
  min = 0,
  max,
  step = 1,
  onChange,
  color = '#8b5cf6', // 默认紫色
  className = '',
  ...props
}: {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** 进度条填充颜色（hex/hsl/rgb） */
  color?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'>) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(parseFloat(e.target.value)),
    [onChange]
  );

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      className={`slider w-full h-1 rounded-full appearance-none cursor-pointer ${className}`}
      style={{ background: `linear-gradient(to right, ${color} ${percent}%, rgba(255,255,255,0.2) ${percent}%)` }}
      {...props}
    />
  );
}
