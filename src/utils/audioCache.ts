/**
 * AudioCache v3 — 优先文件缓存，大文件降级流式
 *
 * 策略：
 *   1. Cache API 有缓存 → blob URL 播放（最稳定）
 *   2. 未缓存 + 文件 ≤50MB → 等待下载完成后用 blob URL 播放
 *   3. 未缓存 + 文件 >50MB → 降级到原始 URL 流式播放
 *
 * 持久化：Cache API（PWA 模式下跨会话保留）
 * 淘汰：LRU，总容量上限 ~500MB
 * 预取：后台静默缓存下一章
 */

import { playerLog } from './playerLogger';

const CACHE_NAME = 'audio-cache-v1';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const STREAM_THRESHOLD = 50 * 1024 * 1024; // 超过 50MB 才降级流式

/** 缓存元数据 */
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
  private pending = new Map<string, Promise<string>>();
  /** 内存中的 blob URL 缓存 */
  private blobUrls = new Map<string, string>();

  static getInstance(): AudioCache {
    if (!this.instance) this.instance = new AudioCache();
    return this.instance;
  }

  private constructor() {
    this.meta = loadMeta();
  }

  /**
   * 获取播放 URL（阻塞式，确保拿到可靠的播放源）
   *
   * 优先级：
   * 1. 已在 Cache API → 直接返回 blob URL
   * 2. 文件 ≤50MB → 下载到 Cache 后返回 blob URL（等待下载）
   * 3. 文件 >50MB → 返回原始 URL（流式播放）
   */
  async getPlayUrl(originalUrl: string): Promise<string> {
    // 1. 检查已有缓存
    const cached = await this.getFromCache(originalUrl);
    if (cached) {
      this.touchMeta(originalUrl);
      playerLog('cache', `缓存命中 · ${this.formatUrl(originalUrl)}`);
      return cached;
    }

    // 2. 正在下载中 → 等待
    if (this.pending.has(originalUrl)) {
      playerLog('cache', `等待下载中 · ${this.formatUrl(originalUrl)}`);
      return this.pending.get(originalUrl)!;
    }

    // 3. 检查文件大小
    let fileSize = 0;
    try {
      const head = await fetch(originalUrl, { method: 'HEAD' });
      fileSize = parseInt(head.headers.get('content-length') || '0');
    } catch {
      // HEAD 失败，假设小文件，尝试下载缓存
    }

    // 4. 大文件(>50MB) → 降级流式播放
    if (fileSize > STREAM_THRESHOLD) {
      playerLog('cache', `大文件流式播放（${Math.round(fileSize / 1024 / 1024)}MB）· ${this.formatUrl(originalUrl)}`);
      return originalUrl;
    }

    // 5. 小文件(≤50MB) → 下载到缓存后播放
    playerLog('cache', `下载缓存中（${fileSize > 0 ? Math.round(fileSize / 1024 / 1024) + 'MB' : '未知大小'}）· ${this.formatUrl(originalUrl)}`);
    const promise = this.downloadAndCache(originalUrl);
    this.pending.set(originalUrl, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(originalUrl);
    }
  }

  /** 是否已在缓存中 */
  isCached(url: string): boolean {
    return this.meta.has(url);
  }

  /** 预取下一章（后台静默） */
  prefetchAhead(urls: string[], currentIndex: number): void {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= urls.length) return;
    const nextUrl = urls[nextIdx];
    if (this.meta.has(nextUrl) || this.pending.has(nextUrl)) return;

    // 后台静默预取
    const promise = this.downloadAndCache(nextUrl).catch(() => nextUrl);
    this.pending.set(nextUrl, promise);
    promise.finally(() => this.pending.delete(nextUrl));
  }

  /** 清空所有缓存 */
  async clear(): Promise<void> {
    this.pending.clear();
    for (const blobUrl of this.blobUrls.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.blobUrls.clear();
    try { await caches.delete(CACHE_NAME); } catch { /* ignore */ }
    this.meta.clear();
    saveMeta(this.meta);
    playerLog('cache', '缓存已清空');
  }

  /** 缓存信息 */
  getCacheInfo(): { entries: number; totalMB: number } {
    let total = 0;
    for (const m of this.meta.values()) total += m.size;
    return { entries: this.meta.size, totalMB: Math.round(total / 1024 / 1024) };
  }

  // ── 内部方法 ──

  /** 从 Cache API 获取 blob URL */
  private async getFromCache(url: string): Promise<string | null> {
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

  /** 下载文件到 Cache API 并返回 blob URL */
  private async downloadAndCache(url: string): Promise<string> {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const clone = response.clone();
      const blob = await clone.blob();
      const size = blob.size;

      // 如果实际大小超过阈值，不缓存，返回 blob URL（已下载的数据不浪费）
      if (size > STREAM_THRESHOLD) {
        playerLog('cache', `实际文件过大（${Math.round(size / 1024 / 1024)}MB），不存缓存 · ${this.formatUrl(url)}`);
        const blobUrl = URL.createObjectURL(blob);
        this.blobUrls.set(url, blobUrl);
        return blobUrl;
      }

      await this.evictIfNeeded(size);
      await cache.put(url, response);

      this.meta.set(url, { url, size, lastAccessed: Date.now() });
      saveMeta(this.meta);

      const blobUrl = URL.createObjectURL(blob);
      this.blobUrls.set(url, blobUrl);
      playerLog('cache', `缓存完成 · ${this.formatUrl(url)} · ${Math.round(size / 1024 / 1024)}MB`);
      return blobUrl;
    } catch (err) {
      // 下载失败，降级到原始 URL
      playerLog('cache', `下载失败，降级流式 · ${this.formatUrl(url)} · ${(err as Error).message}`);
      return url;
    }
  }

  /** LRU 淘汰 */
  private async evictIfNeeded(neededSize: number): Promise<void> {
    let total = 0;
    for (const m of this.meta.values()) total += m.size;

    if (total + neededSize <= MAX_CACHE_SIZE) return;

    const sorted = [...this.meta.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const cache = await caches.open(CACHE_NAME);

    for (const [url, entry] of sorted) {
      if (total + neededSize <= MAX_CACHE_SIZE) break;
      await cache.delete(url);
      total -= entry.size;
      this.meta.delete(url);
      if (this.blobUrls.has(url)) {
        URL.revokeObjectURL(this.blobUrls.get(url)!);
        this.blobUrls.delete(url);
      }
      playerLog('cache', `LRU 淘汰 · ${this.formatUrl(url)}`);
    }

    saveMeta(this.meta);
  }

  private touchMeta(url: string): void {
    const m = this.meta.get(url);
    if (m) {
      m.lastAccessed = Date.now();
      saveMeta(this.meta);
    }
  }

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
