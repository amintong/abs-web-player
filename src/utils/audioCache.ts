/**
 * AudioCache - 音频缓存单例
 *
 * 原则：播放器只从缓存播放音频，所有播放必须先触发加载缓存，再从缓存里播放。
 *
 * 策略：
 * - 下载完整章节为 Blob，创建 blob URL 供 HTMLAudioElement 播放
 * - LRU 淘汰，总容量上限 ~300MB
 * - 加载当前章节时自动预取后续 N 章
 * - 仅在手动点击"清除缓存"时或 LRU 淘汰时清理
 */

const MAX_CACHE_SIZE = 300 * 1024 * 1024; // 300MB
const PREFETCH_AHEAD = 3; // 预取后续章节数

interface CacheEntry {
  blob: Blob;
  objectUrl: string;
  size: number;
  url: string;
  lastAccessed: number;
}

export class AudioCache {
  private static instance: AudioCache;

  private entries = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<string>>();
  private totalSize = 0;

  static getInstance(): AudioCache {
    if (!this.instance) this.instance = new AudioCache();
    return this.instance;
  }

  /** 获取缓存的 blob URL —— 播放器的唯一音频来源 */
  async getCached(url: string): Promise<string> {
    const existing = this.entries.get(url);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing.objectUrl;
    }

    if (this.pending.has(url)) {
      return this.pending.get(url)!;
    }

    const promise = this.fetchAndCache(url);
    this.pending.set(url, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(url);
    }
  }

  /** 是否已在缓存中 */
  isCached(url: string): boolean {
    return this.entries.has(url);
  }

  /** 静默预取，失败不影响主流程 */
  prefetch(url: string): void {
    if (this.entries.has(url) || this.pending.has(url)) return;
    const promise = this.fetchAndCache(url);
    this.pending.set(url, promise);
    promise
      .catch(() => { /* 预取失败静默处理 */ })
      .finally(() => this.pending.delete(url));
  }

  /** 预取后续 N 个章节 */
  prefetchAhead(urls: string[], currentIndex: number, count = PREFETCH_AHEAD): void {
    for (let i = 1; i <= count; i++) {
      const idx = currentIndex + i;
      if (idx < urls.length) this.prefetch(urls[idx]);
    }
  }

  /** 取消所有正在进行的预取 */
  cancelPending(): void {
    this.pending.clear();
  }

  /** 清空所有缓存 */
  clear(): void {
    this.cancelPending();
    for (const entry of this.entries.values()) {
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.entries.clear();
    this.totalSize = 0;
  }

  /** 缓存信息，用于 UI 展示 */
  getCacheInfo(): { entries: number; totalMB: number } {
    return { entries: this.entries.size, totalMB: Math.round(this.totalSize / 1024 / 1024) };
  }

  private async fetchAndCache(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const size = blob.size;

    this.evictIfNeeded(size);

    this.entries.set(url, { blob, objectUrl, size, url, lastAccessed: Date.now() });
    this.totalSize += size;

    return objectUrl;
  }

  private evictIfNeeded(neededSize: number): void {
    while (this.totalSize + neededSize > MAX_CACHE_SIZE && this.entries.size > 0) {
      let oldestUrl = '';
      let oldestTime = Infinity;
      for (const [url, entry] of this.entries) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestUrl = url;
        }
      }
      if (!oldestUrl) break;
      this.evict(oldestUrl);
    }
  }

  private evict(url: string): void {
    const entry = this.entries.get(url);
    if (entry) {
      URL.revokeObjectURL(entry.objectUrl);
      this.totalSize -= entry.size;
      this.entries.delete(url);
    }
  }
}
