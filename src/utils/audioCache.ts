/**
 * AudioCache v2 — 流式播放 + Cache API 持久缓存
 *
 * 核心策略改变：
 *   v1: 必须下载整个文件到 Blob 才播放（100MB 等太久）
 *   v2: 直接用原始 URL 流式播放（浏览器边下边播），同时后台持久缓存
 *
 * 播放优先级：
 *   1. Cache API 中有缓存 → 用缓存 Response 创建 blob URL
 *   2. 未缓存 → 直接返回原始 URL（浏览器流式播放），后台静默缓存
 *
 * 持久化：使用 Cache API（PWA 模式下跨会话保留）
 * 淘汰：LRU，总容量上限 ~500MB
 * 预取：后台静默缓存后续 N 章
 */

import { playerLog } from './playerLogger';

const CACHE_NAME = 'audio-cache-v1';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const PREFETCH_AHEAD = 1;

/** 缓存元数据（存在 localStorage 中记录 LRU 和大小） */
interface CacheMeta {
  url: string;
  size: number;
  lastAccessed: number;
}

const META_KEY = 'audio-cache-meta';

function loadMeta(): Map<string, CacheMeta> {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return new Map();
    const arr: CacheMeta[] = JSON.parse(raw);
    return new Map(arr.map(m => [m.url, m]));
  } catch {
    return new Map();
  }
}

function saveMeta(meta: Map<string, CacheMeta>): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify([...meta.values()]));
  } catch { /* quota exceeded */ }
}

export class AudioCache {
  private static instance: AudioCache;

  private meta: Map<string, CacheMeta>;
  private pending = new Set<string>();
  /** 内存中的 blob URL 缓存（避免重复 createObjectURL） */
  private blobUrls = new Map<string, string>();

  static getInstance(): AudioCache {
    if (!this.instance) this.instance = new AudioCache();
    return this.instance;
  }

  private constructor() {
    this.meta = loadMeta();
  }

  /**
   * 获取播放 URL
   * - 已缓存 → 返回 blob URL（离线可播放）
   * - 未缓存 → 返回原始 URL（浏览器流式播放），同时后台缓存
   */
  async getPlayUrl(originalUrl: string): Promise<string> {
    // 1. 检查 Cache API
    const cached = await this.getFromCache(originalUrl);
    if (cached) {
      this.touchMeta(originalUrl);
      playerLog('cache', `缓存命中 · ${this.formatUrl(originalUrl)}`);
      return cached;
    }

    // 2. 未缓存：返回原始 URL 让浏览器流式播放，后台静默缓存
    playerLog('cache', `流式播放 · ${this.formatUrl(originalUrl)}`);
    this.cacheInBackground(originalUrl);
    return originalUrl;
  }

  /** 是否已在缓存中（同步检查 meta） */
  isCached(url: string): boolean {
    return this.meta.has(url);
  }

  /** 预取后续 N 个章节（后台静默） */
  prefetchAhead(urls: string[], currentIndex: number, count = PREFETCH_AHEAD): void {
    for (let i = 1; i <= count; i++) {
      const idx = currentIndex + i;
      if (idx < urls.length) {
        this.cacheInBackground(urls[idx]);
      }
    }
  }

  /** 清空所有缓存 */
  async clear(): Promise<void> {
    this.pending.clear();
    // 清理 blob URLs
    for (const blobUrl of this.blobUrls.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.blobUrls.clear();
    // 清理 Cache API
    try {
      await caches.delete(CACHE_NAME);
    } catch { /* ignore */ }
    // 清理 meta
    this.meta.clear();
    saveMeta(this.meta);
    playerLog('cache', '缓存已清空');
  }

  /** 缓存信息，用于 UI 展示 */
  getCacheInfo(): { entries: number; totalMB: number } {
    let total = 0;
    for (const m of this.meta.values()) total += m.size;
    return { entries: this.meta.size, totalMB: Math.round(total / 1024 / 1024) };
  }

  // ── 内部方法 ──

  /** 从 Cache API 获取并创建 blob URL */
  private async getFromCache(url: string): Promise<string | null> {
    // 先检查内存中的 blob URL
    if (this.blobUrls.has(url)) return this.blobUrls.get(url)!;

    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      if (!response) return null;

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.blobUrls.set(url, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  }

  /** 后台静默缓存（不阻塞播放） */
  private cacheInBackground(url: string): void {
    if (this.meta.has(url) || this.pending.has(url)) return;
    this.pending.add(url);

    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const response = await fetch(url);
        if (!response.ok) return;

        const clone = response.clone();
        const blob = await clone.blob();
        const size = blob.size;

        // LRU 淘汰
        await this.evictIfNeeded(size);

        // 存入 Cache API
        await cache.put(url, response);

        // 更新 meta
        this.meta.set(url, { url, size, lastAccessed: Date.now() });
        saveMeta(this.meta);
        playerLog('cache', `后台缓存完成 · ${this.formatUrl(url)} · ${Math.round(size / 1024 / 1024)}MB`);
      } catch {
        // 缓存失败不影响播放
      } finally {
        this.pending.delete(url);
      }
    })();
  }

  /** LRU 淘汰 */
  private async evictIfNeeded(neededSize: number): Promise<void> {
    let total = 0;
    for (const m of this.meta.values()) total += m.size;

    if (total + neededSize <= MAX_CACHE_SIZE) return;

    // 按 lastAccessed 排序，淘汰最旧的
    const sorted = [...this.meta.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const cache = await caches.open(CACHE_NAME);

    for (const [url, entry] of sorted) {
      if (total + neededSize <= MAX_CACHE_SIZE) break;
      await cache.delete(url);
      total -= entry.size;
      this.meta.delete(url);
      // 清理 blob URL
      if (this.blobUrls.has(url)) {
        URL.revokeObjectURL(this.blobUrls.get(url)!);
        this.blobUrls.delete(url);
      }
      playerLog('cache', `LRU 淘汰 · ${this.formatUrl(url)}`);
    }

    saveMeta(this.meta);
  }

  /** 更新 LRU 时间 */
  private touchMeta(url: string): void {
    const m = this.meta.get(url);
    if (m) {
      m.lastAccessed = Date.now();
      saveMeta(this.meta);
    }
  }

  /** 格式化 URL 用于日志（只显示最后的文件名部分） */
  private formatUrl(url: string): string {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      return parts[parts.length - 1] || parts[parts.length - 2] || url.slice(-30);
    } catch {
      return url.slice(-30);
    }
  }
}
