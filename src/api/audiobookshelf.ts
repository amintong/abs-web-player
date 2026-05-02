import { ABSMediaItem, ABSLibrary, ABSUser } from '../types';

// 直接调用 ABS 服务器（纯前端，无后端代理）
// 需要用户在 nginx 上配置跨域头

let authToken: string | null = localStorage.getItem('abs_token');
let serverBase: string = localStorage.getItem('abs_server') || import.meta.env.VITE_ABS_SERVER || '';

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      authToken = null;
      localStorage.removeItem('abs_token');
      throw new Error('认证失败，请重新登录');
    }
    throw new Error(`API 请求失败: ${response.status}`);
  }
  return response.json();
}

// 登录 (直接 POST 到 /login)
export async function login(server: string, username: string, password: string): Promise<{ user: ABSUser }> {
  const base = server.replace(/\/+$/, '');

  // 先做 CORS 预检：用 HEAD 请求检查服务器是否返回正确的跨域头
  try {
    const corsCheck = await fetch(`${base}/ping`, { method: 'GET', mode: 'cors' });
    if (!corsCheck.ok && corsCheck.status === 0) {
      throw new Error('CORS');
    }
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg === 'CORS' || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      throw new Error('跨域请求被拦截（CORS）。请在服务器 Nginx 配置中添加 CORS 响应头，详见下方帮助。');
    }
    // 其他网络错误（如服务器不可达）
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

  if (!response.ok) {
    throw new Error('登录失败，请检查用户名和密码');
  }

  const data = await response.json();
  authToken = data.user.token;
  serverBase = base;
  localStorage.setItem('abs_token', data.user.token);
  localStorage.setItem('abs_server', base);
  localStorage.setItem('abs_username', username);

  return { user: data.user };
}

// 使用 .env 配置自动登录
export async function initApi(): Promise<{ user: ABSUser }> {
  const server = import.meta.env.VITE_ABS_SERVER;
  const username = import.meta.env.VITE_ABS_USERNAME;
  const password = import.meta.env.VITE_ABS_PASSWORD;
  if (!server || !username || !password) {
    throw new Error('请配置 .env 文件');
  }
  return login(server, username, password);
}

// 获取当前用户信息（验证 token 是否有效）
export async function getCurrentUser(): Promise<ABSUser> {
  const response = await fetch(`${serverBase}/api/me`, { headers: getHeaders() });
  return handleResponse<ABSUser>(response);
}

// 获取库列表
export async function getLibraries(): Promise<ABSLibrary[]> {
  const response = await fetch(`${serverBase}/api/libraries`, { headers: getHeaders() });
  const data = await handleResponse<{ libraries: ABSLibrary[] }>(response);
  return data.libraries;
}

// 获取库项目列表
export async function getLibraryItems(libraryId: string, sortBy: string = 'media.metadata.title', limit: number = 100): Promise<ABSMediaItem[]> {
  const response = await fetch(
    `${serverBase}/api/libraries/${libraryId}/items?sort=${sortBy}&limit=${limit}`,
    { headers: getHeaders() }
  );
  const data = await handleResponse<{ results: ABSMediaItem[] }>(response);
  return data.results;
}

// 获取最近添加
export async function getRecentlyAdded(libraryId: string, limit: number = 20): Promise<ABSMediaItem[]> {
  const response = await fetch(
    `${serverBase}/api/libraries/${libraryId}/items?sort=addedAt&desc=1&limit=${limit}`,
    { headers: getHeaders() }
  );
  const data = await handleResponse<{ results: ABSMediaItem[] }>(response);
  return data.results;
}

// 获取单个媒体项详情
export async function getItem(itemId: string): Promise<ABSMediaItem> {
  const response = await fetch(`${serverBase}/api/items/${itemId}`, { headers: getHeaders() });
  return handleResponse<ABSMediaItem>(response);
}

// 获取播放进度
export async function getProgress(libraryItemId: string): Promise<{ currentTime: number; duration: number }> {
  try {
    const response = await fetch(`${serverBase}/api/me/progress/${libraryItemId}`, { headers: getHeaders() });
    if (!response.ok) return { currentTime: 0, duration: 0 };
    const data = await response.json();
    return { currentTime: data.currentTime || 0, duration: data.duration || 0 };
  } catch {
    return { currentTime: 0, duration: 0 };
  }
}

// 上报播放进度 (节流)
let lastSync = 0;
export async function syncProgress(libraryItemId: string, currentTime: number, duration: number): Promise<void> {
  const now = Date.now();
  if (now - lastSync < 15000) return; // 15秒内不重复上报
  lastSync = now;

  try {
    await fetch(`${serverBase}/api/me/progress/${libraryItemId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        libraryItemId,
        currentTime,
        duration,
        progress: duration > 0 ? currentTime / duration : 0,
      }),
    });
  } catch {
    // 静默失败，不影响用户体验
  }
}

// 强制上报 (用于页面关闭前)
export function syncProgressNow(libraryItemId: string, currentTime: number, duration: number): void {
  navigator.sendBeacon(`${serverBase}/api/me/progress/${libraryItemId}`, JSON.stringify({
    libraryItemId, currentTime, duration,
    progress: duration > 0 ? currentTime / duration : 0,
  }));
}

// 获取音频流 URL (HTML5 Audio 不支持自定义 Header, 用 URL query 传 token)
export function getAudioUrl(itemId: string, ino: string): string {
  const token = localStorage.getItem('abs_token') || '';
  return `${serverBase}/api/items/${itemId}/file/${ino}?token=${token}`;
}

// 获取封面 URL
export function getCoverUrl(itemId: string): string {
  const token = localStorage.getItem('abs_token') || '';
  return `${serverBase}/api/items/${itemId}/cover?token=${token}`;
}

// 登出
export function logout(): void {
  authToken = null;
  localStorage.removeItem('abs_token');
  localStorage.removeItem('abs_server');
  localStorage.removeItem('abs_username');
}

// 检查认证状态
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('abs_token');
}
