/**
 * API 兼容层 — 将函数式 API 转发到 MediaServer.current
 *
 * 所有业务代码统一通过此层调用后端。
 * 内部由 MediaServer.current（适配器实例）负责与具体后端通信。
 */

import { MediaServer } from '../adapters';
import type { MediaItem, Library, PlaybackProgress, UserInfo } from '../adapters/interface';

// ── 认证 ──

export async function login(server: string, username: string, password: string): Promise<UserInfo> {
  return MediaServer.current.login(server, username, password);
}

export function logout(): void {
  if (MediaServer.isConnected) MediaServer.current.logout();
  MediaServer.clearAdapter();
}

export async function validateSession(): Promise<UserInfo> {
  return MediaServer.current.validateSession();
}

export function isAuthenticated(): boolean {
  return MediaServer.isConnected;
}

// ── 库 ──

export async function getLibraries(): Promise<Library[]> {
  return MediaServer.current.getLibraries();
}

export async function getLibraryItems(libraryId: string, _sortBy = '', limit = 100): Promise<MediaItem[]> {
  return MediaServer.current.getLibraryItems(libraryId, { limit });
}

export async function getRecentlyAdded(libraryId: string, limit = 20): Promise<MediaItem[]> {
  return MediaServer.current.getRecentlyAdded(libraryId, limit);
}

// ── 媒体 ──

export async function getItem(itemId: string): Promise<MediaItem> {
  return MediaServer.current.getItem(itemId);
}

export function getAudioUrl(itemId: string, trackId: string): string {
  return MediaServer.current.getAudioUrl(itemId, trackId);
}

export function getCoverUrl(itemId: string): string {
  return MediaServer.current.getCoverUrl(itemId);
}

// ── 进度 ──

export async function getProgress(itemId: string): Promise<PlaybackProgress> {
  return MediaServer.current.getProgress(itemId);
}

export async function getUserProgress(libraryId?: string): Promise<PlaybackProgress[]> {
  return MediaServer.current.getUserProgress(libraryId);
}

export async function syncProgress(itemId: string, currentTime: number, duration: number): Promise<void> {
  return MediaServer.current.syncProgress(itemId, currentTime, duration);
}

export function syncProgressNow(itemId: string, currentTime: number, duration: number): void {
  MediaServer.current.syncProgressBeacon(itemId, currentTime, duration);
}
