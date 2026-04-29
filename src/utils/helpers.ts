import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ABSMediaItem } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '0 分钟';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hrs > 0) {
    return `${hrs} 小时 ${mins > 0 ? `${mins} 分钟` : ''}`;
  }
  return `${mins} 分钟`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function calculateProgress(currentTime: number, duration: number): number {
  if (duration === 0) return 0;
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

export function parseSkipTime(timeStr: string | number | undefined): number {
  if (timeStr === undefined || timeStr === null) return 0;
  if (typeof timeStr === 'number') return timeStr;
  const parsed = parseFloat(timeStr);
  return isNaN(parsed) ? 0 : parsed;
}

/** 统一获取作者名：部分 API 返回 authorName，部分返回 authors 数组 */
export function getAuthorName(item: ABSMediaItem | undefined | null): string {
  if (!item?.media?.metadata) return 'Unknown Author';
  const meta = item.media.metadata;
  if (meta.authorName) return meta.authorName;
  if (meta.authors && meta.authors.length > 0) {
    return meta.authors.map(a => a.name).join(', ');
  }
  return 'Unknown Author';
}
