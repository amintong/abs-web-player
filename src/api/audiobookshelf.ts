/**
 * API 兼容层 — 将旧的函数式 API 转发到 MediaServer.current
 *
 * 存在意义：渐进迁移，避免一次性改动所有消费方。
 * 返回值保持旧 ABSMediaItem 类型（raw 对象），旧代码无需改动。
 * 后续新代码应直接使用 MediaServer.current.xxx()
 */

import { MediaServer } from '../adapters';
import type { ABSMediaItem, ABSLibrary, ABSUser } from '../types';

// ── 认证 ──

export async function login(server: string, username: string, password: string): Promise<{ user: ABSUser }> {
  const user = await MediaServer.current.login(server, username, password);
  return { user: user.raw as ABSUser };
}

export function logout(): void {
  if (MediaServer.isConnected) MediaServer.current.logout();
  MediaServer.clearAdapter();
}

export async function getCurrentUser(): Promise<ABSUser> {
  const user = await MediaServer.current.validateSession();
  return user.raw as ABSUser;
}

// ── 库 ──

export async function getLibraries(): Promise<ABSLibrary[]> {
  const response = await fetch(`${MediaServer.current.serverUrl}/api/libraries`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('abs_token') || ''}`,
    },
  });
  if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
  const data = await response.json();
  return data.libraries;
}

export async function getLibraryItems(libraryId: string, sortBy = 'media.metadata.title', limit = 100): Promise<ABSMediaItem[]> {
  const response = await fetch(
    `${MediaServer.current.serverUrl}/api/libraries/${libraryId}/items?sort=${sortBy}&limit=${limit}`,
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('abs_token') || ''}` } }
  );
  if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
  const data = await response.json();
  return data.results;
}

export async function getRecentlyAdded(libraryId: string, limit = 20): Promise<ABSMediaItem[]> {
  const response = await fetch(
    `${MediaServer.current.serverUrl}/api/libraries/${libraryId}/items?sort=addedAt&desc=1&limit=${limit}`,
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('abs_token') || ''}` } }
  );
  if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
  const data = await response.json();
  return data.results;
}

// ── 媒体 ──

export async function getItem(itemId: string): Promise<ABSMediaItem> {
  const response = await fetch(`${MediaServer.current.serverUrl}/api/items/${itemId}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('abs_token') || ''}` },
  });
  if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
  return response.json();
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
