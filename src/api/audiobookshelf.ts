/**
 * API 兼容层 — 将旧的函数式 API 转发到 MediaServer.current
 *
 * 存在意义：渐进迁移，避免一次性改动所有消费方。
 * 返回值保持旧 ABSMediaItem 类型（raw 对象），旧代码无需改动。
 * 后续新代码应直接使用 MediaServer.current.xxx()
 */

import { MediaServer } from '../adapters';

// ── 认证 ──

export async function login(server: string, username: string, password: string): Promise<{ user: any }> {
  const user = await MediaServer.current.login(server, username, password);
  return { user: user.raw || user };
}

export function logout(): void {
  if (MediaServer.isConnected) MediaServer.current.logout();
  MediaServer.clearAdapter();
}

export async function getCurrentUser(): Promise<any> {
  const user = await MediaServer.current.validateSession();
  return user.raw || user;
}

// ── 库 ──

export async function getLibraries(): Promise<any[]> {
  return MediaServer.current.getLibraries();
}

export async function getLibraryItems(libraryId: string, _sortBy = '', limit = 100): Promise<any[]> {
  return MediaServer.current.getLibraryItems(libraryId, { limit });
}

export async function getRecentlyAdded(libraryId: string, limit = 20): Promise<any[]> {
  return MediaServer.current.getRecentlyAdded(libraryId, limit);
}

// ── 媒体 ──

export async function getItem(itemId: string): Promise<any> {
  return MediaServer.current.getItem(itemId);
}

export function getAudioUrl(itemId: string, trackId: string): string {
  return MediaServer.current.getAudioUrl(itemId, trackId);
}

export function getCoverUrl(itemId: string): string {
  return MediaServer.current.getCoverUrl(itemId);
}

// ── 进度 ──

export async function getProgress(itemId: string): Promise<{ currentTime: number; duration: number }> {
  const p = await MediaServer.current.getProgress(itemId);
  return { currentTime: p.currentTime, duration: p.duration };
}

export async function syncProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
  return MediaServer.current.syncProgress(itemId, currentTime, duration);
}

export function syncProgressNow(itemId: string, currentTime: number, duration: number): void {
  MediaServer.current.syncProgressBeacon(itemId, currentTime, duration);
}

// ── 工具 ──

export function isAuthenticated(): boolean {
  return MediaServer.isConnected;
}
