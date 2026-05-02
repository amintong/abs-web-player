/**
 * EmbyAdapter — Emby 后端适配器
 *
 * 实现 IMediaServerAdapter 接口，将 Emby API 转换为统一数据模型。
 *
 * Emby API 特点：
 * - 认证通过 /Users/AuthenticateByName 获取 AccessToken
 * - 请求头用 X-Emby-Token
 * - 库 = UserViews (CollectionType=audiobooks)
 * - 媒体项 = Items (Type=AudioBook)
 * - 音频流 = /Audio/{Id}/stream
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

export class EmbyAdapter implements IMediaServerAdapter {
  readonly type: ServerType = 'emby';

  private _serverUrl = '';
  private _token: string | null = null;
  private _userId: string | null = null;
  private _lastSync = 0;

  get serverUrl(): string {
    return this._serverUrl;
  }

  constructor() {
    this._serverUrl = localStorage.getItem('emby_server') || '';
    this._token = localStorage.getItem('emby_token') || null;
    this._userId = localStorage.getItem('emby_userId') || null;
  }

  // ── 内部工具 ──

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this._token ? { 'X-Emby-Token': this._token } : {}),
    };
  }

  private authHeader(): string {
    return `MediaBrowser Client="AudioPlayer", Device="Web", DeviceId="pwa-player", Version="1.0.0"`;
  }

  // ── 认证 ──

  async login(server: string, username: string, password: string): Promise<UserInfo> {
    const base = server.replace(/\/+$/, '');

    // CORS 预检
    try {
      await fetch(`${base}/system/info/public`, { method: 'GET', mode: 'cors' });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        throw new Error('跨域请求被拦截（CORS）。请在 Emby 服务器或反向代理中配置 CORS。');
      }
      throw new Error(`无法连接服务器: ${msg}`);
    }

    const response = await fetch(`${base}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': this.authHeader(),
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('登录失败，请检查用户名和密码');
      throw new Error(`Emby 登录失败: ${response.status}`);
    }

    const data = await response.json();
    this._token = data.AccessToken;
    this._userId = data.User?.Id;
    this._serverUrl = base;

    localStorage.setItem('emby_server', base);
    localStorage.setItem('emby_token', data.AccessToken);
    localStorage.setItem('emby_userId', data.User?.Id || '');
    localStorage.setItem('abs_server', base); // 兼容旧逻辑
    localStorage.setItem('abs_token', data.AccessToken); // 兼容旧逻辑

    return {
      id: data.User?.Id || '',
      username: data.User?.Name || username,
      email: undefined,
      token: data.AccessToken,
      raw: data,
    };
  }

  logout(): void {
    this._token = null;
    this._userId = null;
    this._serverUrl = '';
    localStorage.removeItem('emby_server');
    localStorage.removeItem('emby_token');
    localStorage.removeItem('emby_userId');
    localStorage.removeItem('abs_server');
    localStorage.removeItem('abs_token');
  }

  async validateSession(): Promise<UserInfo> {
    const response = await fetch(`${this._serverUrl}/Users/${this._userId}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error('认证失败，请重新登录');
    const user = await response.json();
    return {
      id: user.Id,
      username: user.Name,
      token: this._token || '',
      raw: user,
    };
  }

  // ── 库 ──

  async getLibraries(): Promise<Library[]> {
    const response = await fetch(
      `${this._serverUrl}/Users/${this._userId}/Views`,
      { headers: this.headers() }
    );
    if (!response.ok) throw new Error(`获取库列表失败: ${response.status}`);
    const data = await response.json();

    return (data.Items || []).map((item: any) => ({
      id: item.Id,
      name: item.Name,
      mediaType: this.mapCollectionType(item.CollectionType),
      icon: item.ImageTags?.Primary ? `${this._serverUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}` : undefined,
    }));
  }

  async getLibraryItems(libraryId: string, options?: ListOptions): Promise<MediaItem[]> {
    const params = new URLSearchParams({
      ParentId: libraryId,
      IncludeItemTypes: 'AudioBook,Audio',
      Recursive: 'true',
      SortBy: options?.sortBy || 'SortName',
      SortOrder: options?.sortDesc ? 'Descending' : 'Ascending',
      Limit: String(options?.limit || 100),
      Fields: 'Overview,Chapters',
    });
    if (options?.offset) params.set('StartIndex', String(options.offset));

    const response = await fetch(
      `${this._serverUrl}/Users/${this._userId}/Items?${params}`,
      { headers: this.headers() }
    );
    if (!response.ok) throw new Error(`获取列表失败: ${response.status}`);
    const data = await response.json();
    return (data.Items || []).map((item: any) => this.convertMediaItem(item));
  }

  async getRecentlyAdded(libraryId: string, limit = 20): Promise<MediaItem[]> {
    return this.getLibraryItems(libraryId, { sortBy: 'DateCreated', sortDesc: true, limit });
  }

  async searchItems(libraryId: string, query: string): Promise<MediaItem[]> {
    const params = new URLSearchParams({
      ParentId: libraryId,
      SearchTerm: query,
      IncludeItemTypes: 'AudioBook,Audio',
      Recursive: 'true',
      Limit: '50',
      Fields: 'Overview,Chapters',
    });

    const response = await fetch(
      `${this._serverUrl}/Users/${this._userId}/Items?${params}`,
      { headers: this.headers() }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.Items || []).map((item: any) => this.convertMediaItem(item));
  }

  // ── 媒体详情 ──

  async getItem(itemId: string): Promise<MediaItem> {
    const response = await fetch(
      `${this._serverUrl}/Users/${this._userId}/Items/${itemId}`,
      { headers: this.headers() }
    );
    if (!response.ok) throw new Error(`获取详情失败: ${response.status}`);
    const data = await response.json();
    return this.convertMediaItem(data);
  }

  getAudioUrl(itemId: string, trackId: string): string {
    // trackId 在 Emby 里就是子 item 的 Id
    const id = trackId || itemId;
    return `${this._serverUrl}/Audio/${id}/stream?static=true&api_key=${this._token}`;
  }

  getCoverUrl(itemId: string): string {
    return `${this._serverUrl}/Items/${itemId}/Images/Primary?maxHeight=400&api_key=${this._token}`;
  }

  // ── 播放进度 ──

  async getProgress(itemId: string): Promise<PlaybackProgress> {
    try {
      const response = await fetch(
        `${this._serverUrl}/Users/${this._userId}/Items/${itemId}`,
        { headers: this.headers() }
      );
      if (!response.ok) return this.emptyProgress(itemId);
      const data = await response.json();
      const ticks = data.UserData?.PlaybackPositionTicks || 0;
      const durationTicks = data.RunTimeTicks || 0;
      const currentTime = ticks / 10000000; // ticks → seconds
      const duration = durationTicks / 10000000;
      return {
        itemId,
        currentTime,
        duration,
        progress: duration > 0 ? currentTime / duration : 0,
        isFinished: data.UserData?.Played || false,
        lastUpdate: Date.now(),
      };
    } catch {
      return this.emptyProgress(itemId);
    }
  }

  async syncProgress(itemId: string, currentTime: number, _duration: number): Promise<void> {
    const now = Date.now();
    if (now - this._lastSync < 15000) return;
    this._lastSync = now;

    try {
      await fetch(`${this._serverUrl}/Users/${this._userId}/PlayingItems/${itemId}/Progress`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          ItemId: itemId,
          PositionTicks: Math.round(currentTime * 10000000),
          IsPaused: false,
        }),
      });
    } catch {
      // 静默失败
    }
  }

  syncProgressBeacon(itemId: string, currentTime: number, _duration: number): void {
    // Emby 用 PlayingStopped 上报最终进度
    navigator.sendBeacon(
      `${this._serverUrl}/Sessions/Playing/Stopped`,
      JSON.stringify({
        ItemId: itemId,
        PositionTicks: Math.round(currentTime * 10000000),
      })
    );
  }

  async getUserProgress(): Promise<PlaybackProgress[]> {
    // Emby 没有统一的"所有进度"API，从 resume items 获取
    try {
      const response = await fetch(
        `${this._serverUrl}/Users/${this._userId}/Items/Resume?IncludeItemTypes=AudioBook,Audio&Limit=20&Fields=Overview`,
        { headers: this.headers() }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.Items || []).map((item: any) => {
        const ticks = item.UserData?.PlaybackPositionTicks || 0;
        const durationTicks = item.RunTimeTicks || 0;
        const ct = ticks / 10000000;
        const dur = durationTicks / 10000000;
        return {
          itemId: item.Id,
          currentTime: ct,
          duration: dur,
          progress: dur > 0 ? ct / dur : 0,
          isFinished: item.UserData?.Played || false,
          lastUpdate: Date.now(),
        };
      });
    } catch {
      return [];
    }
  }

  // ── 数据转换 ──

  private convertMediaItem(raw: any): MediaItem {
    const chapters: Chapter[] = (raw.Chapters || []).map((ch: any, idx: number) => ({
      id: String(idx),
      index: idx,
      title: ch.Name || `Chapter ${idx + 1}`,
      start: (ch.StartPositionTicks || 0) / 10000000,
      duration: 0, // 需要从相邻 chapter 计算
      trackId: raw.Id, // Emby 单文件用 item Id
    }));

    // 计算每章 duration（从 start 差值）
    for (let i = 0; i < chapters.length; i++) {
      if (i < chapters.length - 1) {
        chapters[i].duration = chapters[i + 1].start - chapters[i].start;
      } else {
        const totalDur = (raw.RunTimeTicks || 0) / 10000000;
        chapters[i].duration = totalDur - chapters[i].start;
      }
    }

    // 如果没有 chapters，创建单章
    if (chapters.length === 0) {
      const dur = (raw.RunTimeTicks || 0) / 10000000;
      chapters.push({
        id: '0',
        index: 0,
        title: raw.Name || 'Track 1',
        start: 0,
        duration: dur,
        trackId: raw.Id,
      });
    }

    const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0) || (raw.RunTimeTicks || 0) / 10000000;

    return {
      id: raw.Id,
      title: raw.Name || '',
      author: raw.AlbumArtist || raw.Artists?.[0] || '',
      narrator: raw.Artists?.[1] || undefined,
      description: raw.Overview || undefined,
      coverUrl: this.getCoverUrl(raw.Id),
      duration: totalDuration,
      chapters,
      raw,
    };
  }

  private mapCollectionType(type: string): Library['mediaType'] {
    switch (type) {
      case 'audiobooks': return 'audiobook';
      case 'music': return 'music';
      case 'tvshows':
      case 'movies': return 'video';
      default: return 'unknown';
    }
  }

  private emptyProgress(itemId: string): PlaybackProgress {
    return { itemId, currentTime: 0, duration: 0, progress: 0, isFinished: false, lastUpdate: 0 };
  }
}
