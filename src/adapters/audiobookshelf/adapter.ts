/**
 * AudiobookshelfAdapter — Audiobookshelf 后端适配器
 *
 * 实现 IMediaServerAdapter 接口，将 ABS API 转换为统一数据模型。
 */

import type {
  IMediaServerAdapter,
  ServerType,
  UserInfo,
  Library,
  MediaItem,
  Chapter,
  PlaybackProgress,
  ListOptions,
} from '../interface';

// ═══════════════════════════════════════
// ABS 原始类型（内部使用，不暴露）
// ═══════════════════════════════════════

interface ABSRawUser {
  id: string;
  username: string;
  email?: string;
  token: string;
  mediaProgress?: ABSRawProgress[];
  [key: string]: unknown;
}

interface ABSRawProgress {
  id: string;
  libraryItemId: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
  [key: string]: unknown;
}

interface ABSRawLibrary {
  id: string;
  name: string;
  mediaType: string;
  icon?: string;
  [key: string]: unknown;
}

interface ABSRawMediaItem {
  id: string;
  media?: {
    id?: string;
    metadata?: {
      title?: string;
      authorName?: string;
      authors?: Array<{ name: string }>;
      narratorName?: string;
      narrators?: Array<{ name: string }>;
      description?: string;
    };
    chapters?: Array<{
      id: number;
      title?: string;
      start: number;
      end: number;
    }>;
    audioFiles?: Array<{
      ino: string;
      duration: number;
      metadata?: { filename?: string };
    }>;
    duration?: number;
  };
  [key: string]: unknown;
}

// ═══════════════════════════════════════
// 适配器实现
// ═══════════════════════════════════════

export class AudiobookshelfAdapter implements IMediaServerAdapter {
  readonly type: ServerType = 'audiobookshelf';

  private _serverUrl = '';
  private _token: string | null = null;
  private _lastSync = 0;

  get serverUrl(): string {
    return this._serverUrl;
  }

  constructor() {
    // 尝试从 localStorage 恢复
    this._serverUrl = localStorage.getItem('abs_server') || '';
    this._token = localStorage.getItem('abs_token') || null;
  }

  // ── 内部工具 ──

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}),
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        this._token = null;
        localStorage.removeItem('abs_token');
        throw new Error('认证失败，请重新登录');
      }
      throw new Error(`API 请求失败: ${response.status}`);
    }
    return response.json();
  }

  // ── 认证 ──

  async login(server: string, username: string, password: string): Promise<UserInfo> {
    const base = server.replace(/\/+$/, '');

    // CORS 预检
    try {
      const corsCheck = await fetch(`${base}/ping`, { method: 'GET', mode: 'cors' });
      if (!corsCheck.ok && corsCheck.status === 0) throw new Error('CORS');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg === 'CORS' || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        throw new Error('跨域请求被拦截（CORS）。请在服务器 Nginx 配置中添加 CORS 响应头，详见下方帮助。');
      }
      throw new Error(`无法连接服务器: ${msg}`);
    }

    const response = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).catch((err) => {
      const msg = (err as Error).message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        throw new Error('跨域请求被拦截（CORS）。请在服务器 Nginx 配置中添加 CORS 响应头，详见下方帮助。');
      }
      throw err;
    });

    if (!response.ok) throw new Error('登录失败，请检查用户名和密码');

    const data = await response.json();
    const rawUser: ABSRawUser = data.user;

    this._token = rawUser.token;
    this._serverUrl = base;
    localStorage.setItem('abs_token', rawUser.token);
    localStorage.setItem('abs_server', base);
    localStorage.setItem('abs_username', username);

    return {
      id: rawUser.id,
      username: rawUser.username,
      email: rawUser.email,
      token: rawUser.token,
      raw: rawUser,
    };
  }

  logout(): void {
    this._token = null;
    this._serverUrl = '';
    localStorage.removeItem('abs_token');
    localStorage.removeItem('abs_server');
    localStorage.removeItem('abs_username');
  }

  async validateSession(): Promise<UserInfo> {
    const response = await fetch(`${this._serverUrl}/api/me`, { headers: this.headers() });
    const rawUser = await this.handleResponse<ABSRawUser>(response);
    return {
      id: rawUser.id,
      username: rawUser.username,
      email: rawUser.email,
      token: this._token || rawUser.token,
      raw: rawUser,
    };
  }

  // ── 库 ──

  async getLibraries(): Promise<Library[]> {
    const response = await fetch(`${this._serverUrl}/api/libraries`, { headers: this.headers() });
    const data = await this.handleResponse<{ libraries: ABSRawLibrary[] }>(response);
    return data.libraries.map(lib => ({
      id: lib.id,
      name: lib.name,
      mediaType: this.mapMediaType(lib.mediaType),
      icon: lib.icon,
    }));
  }

  async getLibraryItems(libraryId: string, options?: ListOptions): Promise<MediaItem[]> {
    const params = new URLSearchParams();
    params.set('sort', options?.sortBy || 'media.metadata.title');
    if (options?.sortDesc) params.set('desc', '1');
    params.set('limit', String(options?.limit || 100));
    if (options?.offset) params.set('page', String(Math.floor(options.offset / (options?.limit || 100))));

    const response = await fetch(
      `${this._serverUrl}/api/libraries/${libraryId}/items?${params}`,
      { headers: this.headers() }
    );
    const data = await this.handleResponse<{ results: ABSRawMediaItem[] }>(response);
    return data.results.map(item => this.convertMediaItem(item));
  }

  async getRecentlyAdded(libraryId: string, limit = 20): Promise<MediaItem[]> {
    return this.getLibraryItems(libraryId, { sortBy: 'addedAt', sortDesc: true, limit });
  }

  async searchItems(libraryId: string, query: string): Promise<MediaItem[]> {
    // ABS 没有专门的搜索 API，拉全量后前端过滤
    const all = await this.getLibraryItems(libraryId, { limit: 500 });
    const q = query.toLowerCase();
    return all.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.author || '').toLowerCase().includes(q) ||
      (item.narrator || '').toLowerCase().includes(q)
    );
  }

  // ── 媒体详情 ──

  async getItem(itemId: string): Promise<MediaItem> {
    const response = await fetch(`${this._serverUrl}/api/items/${itemId}`, { headers: this.headers() });
    const raw = await this.handleResponse<ABSRawMediaItem>(response);
    return this.convertMediaItem(raw);
  }

  getAudioUrl(itemId: string, trackId: string): string {
    return `${this._serverUrl}/api/items/${itemId}/file/${trackId}?token=${this._token || ''}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this._serverUrl}/api/items/${itemId}/cover?token=${this._token || ''}`;
  }

  // ── 播放进度 ──

  async getProgress(itemId: string): Promise<PlaybackProgress> {
    try {
      const response = await fetch(`${this._serverUrl}/api/me/progress/${itemId}`, { headers: this.headers() });
      if (!response.ok) return { itemId, currentTime: 0, duration: 0, progress: 0, isFinished: false, lastUpdate: 0 };
      const data: ABSRawProgress = await response.json();
      return {
        itemId: data.libraryItemId || itemId,
        currentTime: data.currentTime || 0,
        duration: data.duration || 0,
        progress: data.progress || 0,
        isFinished: data.isFinished || false,
        lastUpdate: data.lastUpdate || 0,
      };
    } catch {
      return { itemId, currentTime: 0, duration: 0, progress: 0, isFinished: false, lastUpdate: 0 };
    }
  }

  async syncProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
    const now = Date.now();
    if (now - this._lastSync < 15000) return;
    this._lastSync = now;

    try {
      await fetch(`${this._serverUrl}/api/me/progress/${itemId}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({
          libraryItemId: itemId,
          currentTime,
          duration,
          progress: duration > 0 ? currentTime / duration : 0,
        }),
      });
    } catch {
      // 静默失败
    }
  }

  syncProgressBeacon(itemId: string, currentTime: number, duration: number): void {
    navigator.sendBeacon(
      `${this._serverUrl}/api/me/progress/${itemId}`,
      JSON.stringify({
        libraryItemId: itemId,
        currentTime,
        duration,
        progress: duration > 0 ? currentTime / duration : 0,
      })
    );
  }

  async getUserProgress(libraryId?: string): Promise<PlaybackProgress[]> {
    const user = await this.validateSession();
    const rawUser = user.raw as ABSRawUser;
    let progressList = (rawUser.mediaProgress || []).map(p => ({
      itemId: p.libraryItemId,
      currentTime: p.currentTime || 0,
      duration: p.duration || 0,
      progress: p.progress || 0,
      isFinished: p.isFinished || false,
      lastUpdate: p.lastUpdate || 0,
    }));

    // 如果指定了库，按库过滤（通过请求库的 items 列表获取 ID 集合）
    if (libraryId && progressList.length > 0) {
      try {
        const items = await this.getLibraryItems(libraryId, { limit: 500 });
        const idSet = new Set(items.map(i => i.id));
        progressList = progressList.filter(p => idSet.has(p.itemId));
      } catch {
        // 过滤失败时返回全部
      }
    }

    return progressList;
  }

  // ── 数据转换 ──

  private convertMediaItem(raw: ABSRawMediaItem): MediaItem {
    const media = raw.media;
    const chapters: Chapter[] = [];

    if (media?.chapters && media.audioFiles) {
      media.chapters.forEach((ch, index) => {
        const af = media.audioFiles?.[index];
        chapters.push({
          id: String(ch.id),
          index,
          title: ch.title || `章节 ${index + 1}`,
          start: ch.start,
          duration: af?.duration || (ch.end - ch.start) || 0,
          trackId: af?.ino || '',
        });
      });
    } else if (media?.audioFiles) {
      media.audioFiles.forEach((af, i) => {
        chapters.push({
          id: String(i),
          index: i,
          title: af.metadata?.filename || `Track ${i + 1}`,
          start: 0,
          duration: af.duration,
          trackId: af.ino,
        });
      });
    }

    const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0) || media?.duration || 0;

    const meta = media?.metadata;
    const author = meta?.authorName
      || (meta?.authors?.length ? meta.authors.map(a => a.name).join(', ') : undefined);
    const narrator = meta?.narratorName
      || (meta?.narrators?.length ? meta.narrators.map(n => n.name).join(', ') : undefined);

    return {
      id: raw.id,
      title: meta?.title || '',
      author,
      narrator,
      description: meta?.description,
      coverUrl: this.getCoverUrl(raw.id),
      duration: totalDuration,
      chapters,
      raw,
    };
  }

  private mapMediaType(type: string): Library['mediaType'] {
    switch (type) {
      case 'book': return 'audiobook';
      case 'podcast': return 'podcast';
      case 'music': return 'music';
      default: return 'unknown';
    }
  }
}
