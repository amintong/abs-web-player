/**
 * MediaServer — 全局媒体服务器注册中心（单例）
 *
 * 业务代码统一通过 MediaServer.current 访问当前后端适配器。
 * 登录成功后调用 MediaServer.setAdapter(adapter) 注册。
 */

import type { IMediaServerAdapter, ServerType } from './interface';

class MediaServerRegistry {
  private static instance: MediaServerRegistry;
  private _adapter: IMediaServerAdapter | null = null;

  static getInstance(): MediaServerRegistry {
    if (!this.instance) this.instance = new MediaServerRegistry();
    return this.instance;
  }

  private constructor() {}

  /** 获取当前适配器（未连接时抛错） */
  get current(): IMediaServerAdapter {
    if (!this._adapter) {
      throw new Error('[MediaServer] 未连接任何服务器，请先登录');
    }
    return this._adapter;
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this._adapter !== null;
  }

  /** 当前后端类型 */
  get type(): ServerType | null {
    return this._adapter?.type ?? null;
  }

  /** 当前服务器地址 */
  get serverUrl(): string {
    return this._adapter?.serverUrl ?? '';
  }

  /** 注册/切换适配器（登录成功后调用） */
  setAdapter(adapter: IMediaServerAdapter): void {
    this._adapter = adapter;
  }

  /** 清除适配器（登出时调用） */
  clearAdapter(): void {
    this._adapter = null;
  }

  /** 获取保存的后端类型（用于自动恢复） */
  getSavedServerType(): ServerType | null {
    return (localStorage.getItem('abs_server_type') as ServerType) || null;
  }

  /** 保存后端类型 */
  saveServerType(type: ServerType): void {
    localStorage.setItem('abs_server_type', type);
  }
}

export const MediaServer = MediaServerRegistry.getInstance();
