import { useState, useEffect, useRef } from 'react';
import { Headphones, History, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { login, getLibraries, validateSession } from '../api/audiobookshelf';
import { MediaServer, AudiobookshelfAdapter, EmbyAdapter } from '../adapters';
import type { ServerType } from '../adapters';

const SERVER_TYPE_OPTIONS: { value: ServerType; label: string; available: boolean }[] = [
  { value: 'audiobookshelf', label: 'Audiobookshelf', available: true },
  { value: 'emby', label: 'Emby', available: true },
  { value: 'plex', label: 'Plex (即将支持)', available: false },
];

interface SavedConfig {
  server: string;
  username: string;
  password?: string;
  lastLogin: number;
  serverType?: ServerType;
  libraryId?: string;
  libraryName?: string;
}

/** 简单编码密码，避免 localStorage 明文存储 */
function encodePwd(p: string): string {
  return btoa(encodeURIComponent(p));
}
function decodePwd(encoded: string): string {
  try { return decodeURIComponent(atob(encoded)); } catch { return ''; }
}

/** 解析 .env 中的 VITE_SERVER_{N}_* 格式配置 */
function getEnvServers(): SavedConfig[] {
  const results: SavedConfig[] = [];
  const env = import.meta.env;

  for (let i = 1; i <= 10; i++) {
    const type = env[`VITE_SERVER_${i}_TYPE`];
    const url = env[`VITE_SERVER_${i}_URL`];
    const username = env[`VITE_SERVER_${i}_USERNAME`];
    const password = env[`VITE_SERVER_${i}_PASSWORD`];
    const library = env[`VITE_SERVER_${i}_LIBRARY`];

    if (!url || !username) continue;

    results.push({
      server: url,
      username,
      password: password ? encodePwd(password) : undefined,
      lastLogin: 0,
      serverType: (type as ServerType) || 'audiobookshelf',
      libraryName: library || undefined,
    });
  }
  return results;
}

function getSavedConfigs(): SavedConfig[] {
  let configs: SavedConfig[] = [];
  try {
    configs = JSON.parse(localStorage.getItem('abs_login_history') || '[]');
  } catch { configs = []; }

  // 从 .env 注入未存在的配置
  const envConfigs = getEnvServers();
  for (const env of envConfigs) {
    if (!configs.some(c => c.server === env.server && c.username === env.username)) {
      configs.push(env);
    }
  }
  return configs;
}

/** 登录成功后记录：以 server+username 为唯一 key */
function saveConfig(server: string, username: string, password: string, libraryId?: string, libraryName?: string, sType?: ServerType) {
  const configs = getSavedConfigs().filter(c => !(c.server === server && c.username === username));
  configs.unshift({ server, username, password: encodePwd(password), lastLogin: Date.now(), libraryId, libraryName, serverType: sType });
  localStorage.setItem('abs_login_history', JSON.stringify(configs.slice(0, 10)));
}

/** CORS 配置帮助（可折叠） */
function CorsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <button onClick={() => setOpen(!open)} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors">
        {open ? '▾' : '▸'} 登录失败？可能需要配置 CORS
      </button>
      {open && (
        <div className="mt-3 bg-[var(--color-bg-card)] rounded-xl p-4 text-xs text-[var(--color-text-secondary)] space-y-3">
          <p>本应用是纯前端 PWA，直接从浏览器访问你的 Audiobookshelf 服务器 API。浏览器要求服务器返回 CORS 响应头，否则请求会被拦截。</p>

          <div>
            <p className="text-[var(--color-text)] font-medium mb-1">需要添加的响应头：</p>
            <pre className="bg-black/50 rounded-lg p-3 overflow-x-auto text-[11px] text-green-400 leading-relaxed whitespace-pre">{`Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Credentials: true`}</pre>
          </div>

          <div>
            <p className="text-[var(--color-text)] font-medium mb-1">Nginx 反向代理配置示例：</p>
            <pre className="bg-black/50 rounded-lg p-3 overflow-x-auto text-[11px] text-blue-300 leading-relaxed whitespace-pre">{`server {
    listen 443 ssl;
    server_name abs.example.com;

    location / {
        proxy_pass http://127.0.0.1:13378;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # CORS 配置
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

        # 预检请求直接返回 204
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}`}</pre>
          </div>

          <p className="text-[var(--color-text-tertiary)]">
            提示：如果使用 Caddy / Traefik 等其他反代工具，请参考对应文档添加 CORS 头。
            配置完成后刷新本页面重新登录即可。
          </p>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const { isAuthenticated, setUser, setLibraries, setActiveLibrary } = useAppStore();
  const navRef = useRef(false);

  // 当前已保存的配置
  const savedServer = localStorage.getItem('abs_server') || '';
  const savedUsername = localStorage.getItem('abs_username') || '';
  const hasSavedConfig = !!(savedServer && savedUsername);

  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverType, setServerType] = useState<ServerType>('audiobookshelf');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  // 库选择步骤
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [availableLibraries, setAvailableLibraries] = useState<any[]>([]);
  const [pendingUser, setPendingUser] = useState<any>(null);

  const savedConfigs = getSavedConfigs();

  // 自动登录：仅恢复已保存的有效 token，不会自动用 env
  useEffect(() => {
    if (navRef.current || isAuthenticated) return;

    async function tryAutoLogin() {
      if (savedServer && localStorage.getItem('abs_token')) {
        try {
          const user = await validateSession();
          const libs = await getLibraries();

          setPendingUser(user);
          setAvailableLibraries(libs);
          setShowLibraryPicker(true);
          setIsAutoLogin(false);
          return;
        } catch {
          // token 失效，继续显示登录页
        }
      }

      setIsAutoLogin(false);
      if (hasSavedConfig) {
        setServer(savedServer);
        setUsername(savedUsername);
      }
    }

    tryAutoLogin();
  }, []);

  // 已认证且库已选 → 不显示登录页
  if (isAuthenticated && !showLibraryPicker) return null;

  const handleLogin = async (srv?: string, usr?: string, pwd?: string) => {
    const s = srv || server;
    const u = usr || username;
    const p = pwd || password;
    if (!s || !u || !p) { setError('请填写完整的登录信息'); return; }

    setError('');
    setIsLoading(true);
    try {
      // 根据后端类型注册适配器
      if (serverType === 'emby') {
        const adapter = new EmbyAdapter();
        MediaServer.setAdapter(adapter);
        MediaServer.saveServerType('emby');
      } else {
        const adapter = new AudiobookshelfAdapter();
        MediaServer.setAdapter(adapter);
        MediaServer.saveServerType('audiobookshelf');
      }

      const user = await login(s, u, p);

      const libs = await getLibraries();

      // 登录成功后一律弹出库选择
      setPendingUser(user);
      setAvailableLibraries(libs);
      setShowLibraryPicker(true);
      saveConfig(s, u, p, undefined, undefined, serverType);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  /** 选择库后完成登录 */
  const handleSelectLibrary = (libraryId: string) => {
    const libs = availableLibraries;
    const selectedLib = libs.find((l: any) => l.id === libraryId);
    if (pendingUser) setUser(pendingUser);
    setLibraries(libs);
    setActiveLibrary(libraryId);
    setShowLibraryPicker(false);
    // 更新历史记录里的库信息
    const s = server || localStorage.getItem('abs_server') || '';
    const u = username || localStorage.getItem('abs_username') || '';
    saveConfig(s, u, password, libraryId, selectedLib?.name, serverType);
  };

  const handleHistoryLogin = (cfg: SavedConfig) => {
    const pwd = cfg.password ? decodePwd(cfg.password) : '';
    setServer(cfg.server);
    setUsername(cfg.username);
    setPassword(pwd);
    if (cfg.serverType) setServerType(cfg.serverType);
  };

  const clearHistory = () => {
    localStorage.removeItem('abs_login_history');
    setHistoryKey((k) => k + 1);
  };

  if (isAutoLogin) {
    return (
      <div className="overflow-hidden bg-[var(--color-bg)] flex flex-col items-center justify-center px-6" style={{ height: 'var(--app-height, 100dvh)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-[var(--color-text-secondary)] text-sm">正在自动登录...</p>
      </div>
    );
  }

  // 库选择步骤
  if (showLibraryPicker) {
    return (
      <div className="overflow-hidden bg-[var(--color-bg)] flex flex-col items-center justify-center px-6" style={{ height: 'var(--app-height, 100dvh)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-[var(--color-text)] text-center mb-2">选择媒体库</h2>
          <p className="text-[var(--color-text-secondary)] text-sm text-center mb-8">请选择要使用的媒体库</p>
          <div className="space-y-3">
            {availableLibraries.map((lib: any) => (
              <button
                key={lib.id}
                onClick={() => handleSelectLibrary(lib.id)}
                className="w-full flex items-center gap-4 bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-input)] rounded-2xl px-5 py-4 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Headphones className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-[var(--color-text)] font-medium">{lib.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{lib.mediaType === 'book' ? '有声书' : lib.mediaType}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto bg-[var(--color-bg)] flex flex-col items-center px-6 py-8" style={{ height: 'var(--app-height, 100dvh)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mb-6">
            <Headphones className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">Audiobookshelf</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">iOS Web Player</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-3">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">{error}</div>
          )}

          {/* 后端类型 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">服务器类型</label>
            <div className="flex gap-2">
              {SERVER_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!opt.available}
                  onClick={() => setServerType(opt.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    serverType === opt.value
                      ? 'bg-purple-600 text-white'
                      : opt.available
                        ? 'bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-purple-500'
                        : 'bg-[var(--color-bg-secondary)]/30 border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">服务器地址</label>
            <input type="url" value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://your-server.com:8443"
              className="w-full bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">用户名</label>
            <input type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              className="w-full bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">密码</label>
            <input type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              className="w-full bg-[var(--color-bg-secondary)]/50 border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-[var(--color-text)] font-semibold rounded-xl py-4 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 历史配置 */}
        {savedConfigs.length > 0 && (
          <div key={historyKey} className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span className="text-xs text-[var(--color-text-tertiary)]">历史配置</span>
              </div>
              <button onClick={clearHistory} className="text-xs text-[var(--color-text-muted)] hover:text-red-400 flex items-center gap-1">
                <Trash2 className="w-3 h-3" />清除
              </button>
            </div>
            <div className="space-y-2">
              {savedConfigs.map((cfg, i) => (
                <button key={i} onClick={() => handleHistoryLogin(cfg)}
                  className="w-full flex items-center gap-3 bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-input)] rounded-xl px-4 py-3 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600/50 to-blue-600/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-white">{cfg.username.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-[var(--color-text)] truncate">{cfg.username}</p>
                      {cfg.serverType && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] uppercase flex-shrink-0">
                          {cfg.serverType}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] truncate">{cfg.server}</p>
                    {cfg.libraryName && <p className="text-[10px] text-purple-400 truncate">库: {cfg.libraryName}</p>}
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(cfg.lastLogin).toLocaleDateString('zh-CN')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CORS 配置帮助 */}
        <CorsHelp />
      </div>
    </div>
  );
}
