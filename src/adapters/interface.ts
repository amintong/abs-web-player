/**
 * IMediaServerAdapter — 统一媒体服务器适配器接口
 *
 * 所有后端（Audiobookshelf / Emby / Plex）实现此接口。
 * 业务代码通过 MediaServer.current 调用，不直接依赖具体后端。
 */

// ═══════════════════════════════════════
// 后端类型
// ═══════════════════════════════════════

export type ServerType = 'audiobookshelf' | 'emby' | 'plex';

// ═══════════════════════════════════════
// 统一数据模型
// ═══════════════════════════════════════

export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  token: string;
  /** 原始用户对象（后端特有字段） */
  raw?: unknown;
}

export interface Library {
  id: string;
  name: string;
  mediaType: 'audiobook' | 'podcast' | 'music' | 'video' | 'unknown';
  icon?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  author?: string;
  narrator?: string;
  description?: string;
  coverUrl: string;
  duration: number;         // 全书总时长（秒）
  chapters: Chapter[];
  /** 原始对象（后端特有字段，供特殊场景使用） */
  raw?: unknown;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  start: number;            // 章节在全书中的起始时间（用于 progress 计算）
  duration: number;         // 章节时长
  trackId: string;          // 用于 getAudioUrl
}

export interface PlaybackProgress {
  itemId: string;
  currentTime: number;      // 全书累计秒数
  duration: number;         // 全书总时长
  progress: number;         // 0~1
  isFinished: boolean;
  lastUpdate: number;       // timestamp ms
}

export interface ListOptions {
  sortBy?: string;
  sortDesc?: boolean;
  limit?: number;
  offset?: number;
  query?: string;           // 搜索关键词
}

// ═══════════════════════════════════════
// 适配器接口
// ═══════════════════════════════════════

export interface IMediaServerAdapter {
  /** 后端类型标识 */
  readonly type: ServerType;
  /** 当前连接的服务器地址 */
  readonly serverUrl: string;

  // ── 认证 ──

  /** 登录并返回用户信息 */
  login(server: string, username: string, password: string): Promise<UserInfo>;
  /** 登出，清理本地凭据 */
  logout(): void;
  /** 验证当前 session/token 是否有效 */
  validateSession(): Promise<UserInfo>;

  // ── 库 ──

  /** 获取所有媒体库 */
  getLibraries(): Promise<Library[]>;
  /** 获取库中的媒体列表 */
  getLibraryItems(libraryId: string, options?: ListOptions): Promise<MediaItem[]>;
  /** 获取最近添加 */
  getRecentlyAdded(libraryId: string, limit?: number): Promise<MediaItem[]>;
  /** 搜索 */
  searchItems(libraryId: string, query: string): Promise<MediaItem[]>;

  // ── 媒体详情 ──

  /** 获取单个媒体项详情（含章节列表） */
  getItem(itemId: string): Promise<MediaItem>;
  /** 获取音频播放 URL */
  getAudioUrl(itemId: string, trackId: string): string;
  /** 获取封面 URL */
  getCoverUrl(itemId: string): string;

  // ── 播放进度 ──

  /** 获取单本书的播放进度 */
  getProgress(itemId: string): Promise<PlaybackProgress>;
  /** 同步播放进度到服务端 */
  syncProgress(itemId: string, currentTime: number, duration: number): Promise<void>;
  /** 页面关闭前用 sendBeacon 同步（不等响应） */
  syncProgressBeacon(itemId: string, currentTime: number, duration: number): void;
  /** 获取用户所有播放进度 */
  getUserProgress(): Promise<PlaybackProgress[]>;
}
