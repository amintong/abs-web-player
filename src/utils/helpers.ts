import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

/** 获取作者名 */
export function getAuthorName(item: any): string {
  if (!item) return '';
  return item.author || '';
}

/** 获取标题 */
export function getTitle(item: any): string {
  if (!item) return '';
  return item.title || '';
}

/** 获取描述 */
export function getDescription(item: any): string {
  if (!item) return '';
  return item.description || '';
}

/** 获取时长（秒） */
export function getDuration(item: any): number {
  if (!item) return 0;
  return typeof item.duration === 'number' ? item.duration : 0;
}

/** 获取章节列表 */
export function getChapters(item: any): any[] {
  if (!item) return [];
  return item.chapters || [];
}

/** 获取章节/音频文件数 */
export function getAudioFileCount(item: any): number {
  if (!item) return 0;
  return item.chapters?.length || 0;
}

/** 获取旁白者 */
export function getNarrator(item: any): string {
  if (!item) return '';
  return item.narrator || '';
}
