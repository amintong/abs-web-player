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

/** 统一获取作者名：兼容 ABSMediaItem（嵌套）和 MediaItem（扁平）两种结构 */
export function getAuthorName(item: any): string {
  if (!item) {
    console.warn('[getAuthorName] item 为空');
    return 'Unknown Author';
  }

  // 新结构（MediaItem 扁平）
  if (item.author) return item.author;

  // 旧结构（ABSMediaItem 嵌套）
  if (item.media?.metadata) {
    const meta = item.media.metadata;
    if (meta.authorName) return meta.authorName;
    if (meta.authors && meta.authors.length > 0) {
      return meta.authors.map((a: any) => a.name).join(', ');
    }
  }

  console.warn('[getAuthorName] 未找到作者信息', { id: item.id, title: item.title || item.media?.metadata?.title, keys: Object.keys(item).slice(0, 10) });
  return 'Unknown Author';
}

/** 统一获取标题：兼容新旧结构 */
export function getTitle(item: any): string {
  if (!item) { console.warn('[getTitle] item 为空'); return ''; }
  if (item.title) return item.title;
  if (item.media?.metadata?.title) return item.media.metadata.title;
  console.warn('[getTitle] 未找到标题', { id: item.id, keys: Object.keys(item).slice(0, 10) });
  return item.Name || '';
}

/** 统一获取描述 */
export function getDescription(item: any): string {
  if (!item) return '';
  return item.description || item.media?.metadata?.description || item.Overview || '';
}

/** 统一获取时长 */
export function getDuration(item: any): number {
  if (!item) return 0;
  if (typeof item.duration === 'number') return item.duration;
  if (item.media?.duration) return item.media.duration;
  return 0;
}

/** 统一获取章节列表 */
export function getChapters(item: any): any[] {
  if (!item) return [];
  if (item.chapters?.length) return item.chapters;
  if (item.media?.chapters?.length) return item.media.chapters;
  return [];
}

/** 统一获取音频文件数 */
export function getAudioFileCount(item: any): number {
  if (!item) return 0;
  if (item.chapters?.length) return item.chapters.length;
  if (item.media?.audioFiles?.length) return item.media.audioFiles.length;
  return 0;
}

/** 统一获取旁白者 */
export function getNarrator(item: any): string {
  if (!item) return '';
  return item.narrator || item.media?.metadata?.narratorName || '';
}
