import { useState, useEffect, useRef } from 'react';
import { Headphones, History, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { login, getLibraries, getCurrentUser } from '../api/audiobookshelf';

interface SavedConfig {
  server: string;
  username: string;
  password?: string;  // btoa+encodeURIComponent 编码后保存
  lastLogin: number;
}

/** 简单编码密码，避免 localStorage 明文存储 */
function encodePwd(p: string): string {
  return btoa(encodeURIComponent(p));
}
function decodePwd(encoded: string): string {
  try { return decodeURIComponent(atob(encoded)); } catch { return ''; }
}

function getSavedConfigs(): SavedConfig[] {
  let configs: SavedConfig[] = [];
  try {
    configs = JSON.parse(localStorage.getItem('abs_login_history') || '[]');
  } catch { configs = []; }

  // 如果 .env 有配置，且该用户名不在历史记录中，追加到顶部（含密码，仅展示不保存到 localStorage）
  const envServer = import.meta.env.VITE_ABS_SERVER || '';
  const envUsername = import.meta.env.VITE_ABS_USERNAME || '';
  const envPassword = import.meta.env.VITE_ABS_PASSWORD || '';
  if (envServer && envUsername && !configs.some(c => c.username === envUsername)) {
    configs = [{ server: envServer, username: envUsername, password: encodePwd(envPassword), lastLogin: 0 }, ...configs];
  }
  return configs;
}

/** 登录成功后记录：以用户名为唯一 key，新记录覆盖旧记录，密码经编码后保存 */
function saveConfig(server: string, username: string, password: string) {
  const configs = getSavedConfigs().filter(c => c.username !== username);
  configs.unshift({ server, username, password: encodePwd(password), lastLogin: Date.now() });
  localStorage.setItem('abs_login_history', JSON.stringify(configs.slice(0, 10)));
}

export default function LoginPage() {
  const { isAuthenticated, setUser, setLibraries, setMediaProgress } = useAppStore();
  const navRef = useRef(false);

  // 当前已保存的配置
  const savedServer = localStorage.getItem('abs_server') || '';
  const savedUsername = localStorage.getItem('abs_username') || '';
  const hasSavedConfig = !!(savedServer && savedUsername);

  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(true);
  const [historyKey, setHistoryKey] = useState(0);

  const savedConfigs = getSavedConfigs();

  // 自动登录：仅恢复已保存的有效 token，不会自动用 env
  useEffect(() => {
    if (navRef.current || isAuthenticated) return;

    async function tryAutoLogin() {
      if (savedServer && localStorage.getItem('abs_token')) {
        try {
          const user = await getCurrentUser();
          setUser(user);
          if (user.mediaProgress) setMediaProgress(user.mediaProgress);
          const libs = await getLibraries();
          setLibraries(libs);
          navRef.current = true;
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

  // 已认证就不再显示登录页
  if (isAuthenticated) return null;

  const handleLogin = async (srv?: string, usr?: string, pwd?: string) => {
    const s = srv || server;
    const u = usr || username;
    const p = pwd || password;
    if (!s || !u || !p) { setError('请填写完整的登录信息'); return; }

    setError('');
    setIsLoading(true);
    try {
      const { user } = await login(s, u, p);
      setUser(user);
      if (user.mediaProgress) setMediaProgress(user.mediaProgress);
      const libs = await getLibraries();
      setLibraries(libs);
      saveConfig(s, u, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryLogin = (cfg: SavedConfig) => {
    setServer(cfg.server);
    setUsername(cfg.username);
    setPassword(cfg.password ? decodePwd(cfg.password) : '');
  };

  const clearHistory = () => {
    localStorage.removeItem('abs_login_history');
    setHistoryKey((k) => k + 1);
  };

  if (isAutoLogin) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">正在自动登录...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-8" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mb-6">
            <Headphones className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Audiobookshelf</h1>
          <p className="text-gray-400 text-sm">iOS Web Player</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-3">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">服务器地址</label>
            <input type="url" value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://your-server.com:8443"
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">用户名</label>
            <input type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">密码</label>
            <input type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              required />
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl py-4 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 历史配置 */}
        {savedConfigs.length > 0 && (
          <div key={historyKey} className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500">历史配置</span>
              </div>
              <button onClick={clearHistory} className="text-xs text-gray-600 hover:text-red-400 flex items-center gap-1">
                <Trash2 className="w-3 h-3" />清除
              </button>
            </div>
            <div className="space-y-2">
              {savedConfigs.map((cfg, i) => (
                <button key={i} onClick={() => handleHistoryLogin(cfg)}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600/50 to-blue-600/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-white">{cfg.username.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{cfg.username}</p>
                    <p className="text-xs text-gray-500 truncate">{cfg.server}</p>
                  </div>
                  <span className="text-[10px] text-gray-600">
                    {new Date(cfg.lastLogin).toLocaleDateString('zh-CN')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
