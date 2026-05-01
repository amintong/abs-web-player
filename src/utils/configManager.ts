import { useSyncExternalStore, useCallback, useMemo } from 'react';

/**
 * ConfigManager — 统一配置管理单例
 *
 * 原则：配置是稳定的，版本更新或章节切换不应影响任何配置。
 *
 * 三级配置体系：
 *   App     — 应用级全局默认值（深色模式、快进快退秒数、默认片头片尾）
 *   Book    — 按书籍保存的配置（跳过片头片尾的具体秒数和开关）
 *   Player  — 播放器运行时配置（音量、倍速）
 *
 * 持久化：全部保存在 localStorage key "abs-config"。
 * 迁移：首次加载时从旧的 "abs-app-storage" 和 "abs-skip-settings" 读取存量数据。
 */

// ---------- 类型定义 ----------

export interface BookSkipConfig {
  introSeconds: number;
  outroSeconds: number;
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;
}

export interface AppConfig {
  isDarkMode: boolean;
  skipForwardSeconds: number;
  skipBackwardSeconds: number;
  defaultIntroSeconds: number;
  defaultOutroSeconds: number;
}

export interface PlayerConfig {
  volume: number;
  playbackRate: number;
}

interface StoredData {
  app: AppConfig;
  books: Record<string, BookSkipConfig>;
  player: PlayerConfig;
}

// ---------- 默认值 ----------

const DEFAULT_APP: AppConfig = {
  isDarkMode: true,
  skipForwardSeconds: 30,
  skipBackwardSeconds: 10,
  defaultIntroSeconds: 15,
  defaultOutroSeconds: 10,
};

const DEFAULT_PLAYER: PlayerConfig = {
  volume: 1,
  playbackRate: 1,
};

const DEFAULT_BOOK: BookSkipConfig = {
  introSeconds: 15,
  outroSeconds: 10,
  autoSkipIntro: false,
  autoSkipOutro: false,
};

const STORAGE_KEY = 'abs-config';

// ---------- ConfigManager ----------

type Listener = () => void;

class _ConfigManager {
  private static instance: _ConfigManager;

  private data!: StoredData;
  private listeners = new Set<Listener>();
  private _version = 0;

  static getInstance(): _ConfigManager {
    if (!this.instance) this.instance = new _ConfigManager();
    return this.instance;
  }

  private constructor() {
    const saved = this.loadFromStorage();
    if (saved) {
      this.data = saved;
    } else {
      // 首次加载：尝试从旧存储迁移
      const migrated = this.migrateFromOldStorage();
      this.data = migrated ?? this.getDefaults();
    }
    this.saveToStorage();
  }

  // ==================== App 配置 ====================

  getApp(): AppConfig {
    return { ...this.data.app };
  }

  updateApp(partial: Partial<AppConfig>): void {
    this.data.app = { ...this.data.app, ...partial };
    this._version++;
    this.saveToStorage();
    this.notify();
  }

  // ==================== Book 配置 ====================

  getBook(bookId: string): BookSkipConfig {
    const book = this.data.books[bookId];
    return book
      ? { ...book }
      : { ...DEFAULT_BOOK, introSeconds: this.data.app.defaultIntroSeconds, outroSeconds: this.data.app.defaultOutroSeconds };
  }

  updateBook(bookId: string, partial: Partial<BookSkipConfig>): void {
    const current = this.data.books[bookId] ?? this.getBook(bookId);
    this.data.books[bookId] = { ...current, ...partial };
    this._version++;
    this.saveToStorage();
    this.notify();
  }

  // ==================== Player 配置 ====================

  getPlayer(): PlayerConfig {
    return { ...this.data.player };
  }

  updatePlayer(partial: Partial<PlayerConfig>): void {
    this.data.player = { ...this.data.player, ...partial };
    this._version++;
    this.saveToStorage();
    this.notify();
  }

  // ==================== 生命周期 ====================

  /** 用于 React useSyncExternalStore */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 返回版本号，用于 useSyncExternalStore 的 getSnapshot — 稳定递增，不创建新对象 */
  getSnapshot(): number {
    return this._version;
  }

  // ==================== 私有方法 ====================

  private getDefaults(): StoredData {
    return { app: { ...DEFAULT_APP }, books: {}, player: { ...DEFAULT_PLAYER } };
  }

  private loadFromStorage(): StoredData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredData;
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // 存储满等异常静默处理
    }
  }

  /** 从旧存储 key 迁移存量配置 */
  private migrateFromOldStorage(): StoredData | null {
    let hasData = false;
    const data = this.getDefaults();

    // 从 abs-app-storage 迁移
    try {
      const oldAppRaw = localStorage.getItem('abs-app-storage');
      if (oldAppRaw) {
        const old = JSON.parse(oldAppRaw);
        const { state } = old;
        if (state) {
          if (typeof state.isDarkMode === 'boolean') data.app.isDarkMode = state.isDarkMode;
          if (typeof state.skipForwardSeconds === 'number') data.app.skipForwardSeconds = state.skipForwardSeconds;
          if (typeof state.skipBackwardSeconds === 'number') data.app.skipBackwardSeconds = state.skipBackwardSeconds;
          if (typeof state.playbackRate === 'number') data.player.playbackRate = state.playbackRate;
          if (typeof state.volume === 'number') data.player.volume = state.volume;
          hasData = true;
        }
      }
    } catch { /* ignore */ }

    // 从 abs-skip-settings 迁移
    try {
      const oldSkipRaw = localStorage.getItem('abs-skip-settings');
      if (oldSkipRaw) {
        const old = JSON.parse(oldSkipRaw);
        const { state } = old;
        if (state) {
          if (typeof state.defaultIntroSeconds === 'number') data.app.defaultIntroSeconds = state.defaultIntroSeconds;
          if (typeof state.defaultOutroSeconds === 'number') data.app.defaultOutroSeconds = state.defaultOutroSeconds;
          if (state.books && typeof state.books === 'object') data.books = { ...state.books };
          hasData = true;
        }
      }
    } catch { /* ignore */ }

    // 清理旧存储 key
    try { localStorage.removeItem('abs-app-storage'); } catch { /* ignore */ }
    try { localStorage.removeItem('abs-skip-settings'); } catch { /* ignore */ }

    return hasData ? data : null;
  }

  /** 重置所有配置为默认值 */
  resetAll(): void {
    this.data = this.getDefaults();
    this._version++;
    this.saveToStorage();
    this.notify();
  }

  /** 重置某本书的配置 */
  resetBook(bookId: string): void {
    delete this.data.books[bookId];
    this._version++;
    this.saveToStorage();
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

// 导出单例
export const Config = _ConfigManager.getInstance();

// ---------- React Hooks ----------

/** 使用 App 配置 */
export function useAppConfig(): [AppConfig, (partial: Partial<AppConfig>) => void] {
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => Config.subscribe(cb), []),
    useCallback(() => Config.getSnapshot(), []),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const app = useMemo(() => Config.getApp(), [version]);
  const update = useCallback((partial: Partial<AppConfig>) => Config.updateApp(partial), []);
  return [app, update];
}

/** 使用某本书的配置 */
export function useBookConfig(bookId: string): [BookSkipConfig, (partial: Partial<BookSkipConfig>) => void] {
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => Config.subscribe(cb), []),
    useCallback(() => Config.getSnapshot(), []),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const book = useMemo(() => Config.getBook(bookId), [version, bookId]);
  const update = useCallback((partial: Partial<BookSkipConfig>) => Config.updateBook(bookId, partial), [bookId]);
  return [book, update];
}

/** 使用播放器配置 */
export function usePlayerConfig(): [PlayerConfig, (partial: Partial<PlayerConfig>) => void] {
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => Config.subscribe(cb), []),
    useCallback(() => Config.getSnapshot(), []),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const player = useMemo(() => Config.getPlayer(), [version]);
  const update = useCallback((partial: Partial<PlayerConfig>) => Config.updatePlayer(partial), []);
  return [player, update];
}
