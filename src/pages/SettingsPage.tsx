import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, LogOut, Volume2, Info, TimerReset, SkipBack, SkipForward, RefreshCw, Trash2, Terminal, Copy } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { usePlayerStore } from '../store/playerStore';
import { logout } from '../api/audiobookshelf';
import { checkForUpdates, applyUpdate } from '../sw';
import { AudioCache } from '../utils/audioCache';
import { useAppConfig } from '../utils/configManager';
import { clearLogs, subscribeLogs, type LogEntry, type LogModule } from '../utils/playerLogger';
import SlideUpPanel from '../components/SlideUpPanel';

// ====== 日志查看器组件 =======

const MODULE_LABELS: Record<LogModule | 'all', string> = {
  all: '全部', play: '播放', chapter: '章节', cache: '缓存',
  session: 'Session', sync: '同步', background: '后台',
  sleep: '睡眠', system: '系统',
};

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-gray-300', warn: 'text-yellow-400', error: 'text-red-400',
};

const MODULE_COLORS: Record<LogModule, string> = {
  play: 'bg-purple-500/20 text-purple-300',
  chapter: 'bg-blue-500/20 text-blue-300',
  cache: 'bg-green-500/20 text-green-300',
  session: 'bg-cyan-500/20 text-cyan-300',
  sync: 'bg-orange-500/20 text-orange-300',
  background: 'bg-pink-500/20 text-pink-300',
  sleep: 'bg-indigo-500/20 text-indigo-300',
  system: 'bg-gray-500/20 text-gray-300',
};

interface LogViewerProps {
  logs: LogEntry[];
  filter: LogModule | 'all';
  onFilterChange: (f: LogModule | 'all') => void;
  onClear: () => void;
}

function LogViewer({ logs, filter, onFilterChange, onClear }: LogViewerProps) {
  const filtered = filter === 'all' ? logs : logs.filter((l) => l.module === filter);
  const reversed = [...filtered].reverse(); // 最新的在上面

  const handleCopy = () => {
    const text = reversed.map((l) => `[${l.timestamp}] [${l.module}] ${l.message}${l.data ? ' · ' + JSON.stringify(l.data) : ''}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div>
      {/* 过滤栏 */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto hide-scrollbar pb-1">
        {(Object.keys(MODULE_LABELS) as (LogModule | 'all')[]).map((key) => (
          <button key={key} onClick={() => onFilterChange(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === key ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'
            }`}
          >{MODULE_LABELS[key]}</button>
        ))}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-xs text-gray-300 hover:bg-white/20">
          <Copy className="w-3 h-3" />复制全部
        </button>
        <button onClick={onClear} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20">
          <Trash2 className="w-3 h-3" />清空
        </button>
        <span className="ml-auto text-xs text-gray-600">显示 {filtered.length} / {logs.length}</span>
      </div>

      {/* 日志列表 */}
      {reversed.length === 0 ? (
        <div className="py-12 text-center text-gray-500 text-sm">暂无日志记录</div>
      ) : (
        <div className="overflow-y-auto max-h-[50vh] space-y-0.5 rounded-xl bg-black/30 p-2" style={{ paddingBottom: '0px' }}>
          {reversed.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 text-left">
              <span className="text-[10px] text-gray-600 font-mono flex-shrink-0 pt-0.5 w-16">{entry.timestamp}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${MODULE_COLORS[entry.module] || MODULE_COLORS.system}`}>
                {MODULE_LABELS[entry.module]}
              </span>
              <span className={`text-xs flex-1 min-w-0 leading-tight ${LEVEL_COLORS[entry.level] || LEVEL_COLORS.info}`}>
                {entry.message}
                {entry.data && (
                  <span className="text-[10px] text-gray-600 ml-1 font-mono">{JSON.stringify(entry.data)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout: appLogout } = useAppStore();
  const { playbackRate, setPlaybackRate, volume, setVolume } = usePlayerStore();
  const [appConfig, updateApp] = useAppConfig();

  const [editDefaultIntro, setEditDefaultIntro] = useState(String(appConfig.defaultIntroSeconds));
  const [editDefaultOutro, setEditDefaultOutro] = useState(String(appConfig.defaultOutroSeconds));
  const [editSkipForward, setEditSkipForward] = useState(String(appConfig.skipForwardSeconds));
  const [editSkipBackward, setEditSkipBackward] = useState(String(appConfig.skipBackwardSeconds));
  const [updateStatus, setUpdateStatus] = useState('');
  const [cacheInfo, setCacheInfo] = useState(() => AudioCache.getInstance().getCacheInfo());
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<LogModule | 'all'>('all');

  // 订阅日志变化
  useEffect(() => {
    const unsub = subscribeLogs((entries) => setLogs(entries));
    return () => { unsub(); };
  }, []);

  const refreshCacheInfo = () => setCacheInfo(AudioCache.getInstance().getCacheInfo());

  const handleCheckUpdate = async () => {
    setUpdateStatus('检查中...');
    const result = await checkForUpdates();
    if (result.hasUpdate && confirm(result.message)) {
      applyUpdate();
    } else {
      setUpdateStatus(result.message);
      setTimeout(() => setUpdateStatus(''), 4000);
    }
  };

  const handleSaveDefaults = () => {
    const intro = parseInt(editDefaultIntro) || 15;
    const outro = parseInt(editDefaultOutro) || 10;
    updateApp({ defaultIntroSeconds: intro, defaultOutroSeconds: outro });
  };

  const handleSaveSkipTimes = () => {
    const fwd = parseInt(editSkipForward) || 30;
    const bwd = parseInt(editSkipBackward) || 10;
    updateApp({ skipForwardSeconds: fwd, skipBackwardSeconds: bwd });
  };

  const handleLogout = () => {
    logout();
    appLogout();
    navigate('/');
  };

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-40 glass bg-black/80 border-b border-white/5">
        <div className="flex items-center gap-4 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">设置</h1>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6">
        {/* 用户信息 */}
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <p className="text-white font-medium">{user?.username}</p>
              <p className="text-sm text-gray-400">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* 播放设置 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-400">播放设置</h2>
          </div>

          <div className="px-4 py-4 border-b border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-gray-400" />
                <span className="text-white">音量</span>
              </div>
              <span className="text-sm text-gray-400">{Math.round(volume * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full h-2 rounded-full appearance-none cursor-pointer" />
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-white">播放倍速</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {playbackRates.map((rate) => (
                <button key={rate} onClick={() => setPlaybackRate(rate)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${playbackRate === rate ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                >{rate}x</button>
              ))}
            </div>
          </div>
        </div>

        {/* 片头片尾全局默认值 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <TimerReset className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-medium text-gray-400">片头片尾默认值</h2>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-sm text-white mb-2">默认跳过片头 (秒)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="120" step="5" value={parseInt(editDefaultIntro) || 0}
                  onChange={(e) => setEditDefaultIntro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, #8b5cf6 ${(parseInt(editDefaultIntro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editDefaultIntro) || 0) / 120 * 100}%)` }} />
                <span className="text-white text-sm w-12 text-center">{editDefaultIntro}s</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-white mb-2">默认跳过片尾 (秒)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="120" step="5" value={parseInt(editDefaultOutro) || 0}
                  onChange={(e) => setEditDefaultOutro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, #3b82f6 ${(parseInt(editDefaultOutro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editDefaultOutro) || 0) / 120 * 100}%)` }} />
                <span className="text-white text-sm w-12 text-center">{editDefaultOutro}s</span>
              </div>
            </div>
            <button onClick={handleSaveDefaults}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl py-3 mt-2"
            >保存默认设置</button>
          </div>
        </div>

        {/* 快进/快退时间 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <SkipForward className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-medium text-gray-400">快进/快退</h2>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <SkipForward className="w-4 h-4 text-purple-400" />
                <label className="text-sm text-white">快进 (秒)</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min="5" max="300" step="5" value={parseInt(editSkipForward) || 30}
                  onChange={(e) => setEditSkipForward(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, #8b5cf6 ${(parseInt(editSkipForward) || 30) / 300 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editSkipForward) || 30) / 300 * 100}%)` }} />
                <span className="text-white text-sm w-12 text-center">{editSkipForward}s</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <SkipBack className="w-4 h-4 text-blue-400" />
                <label className="text-sm text-white">快退 (秒)</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min="5" max="120" step="5" value={parseInt(editSkipBackward) || 10}
                  onChange={(e) => setEditSkipBackward(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, #3b82f6 ${(parseInt(editSkipBackward) || 10) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editSkipBackward) || 10) / 120 * 100}%)` }} />
                <span className="text-white text-sm w-12 text-center">{editSkipBackward}s</span>
              </div>
            </div>
            <button onClick={handleSaveSkipTimes}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl py-3 mt-2"
            >保存快进/快退设置</button>
          </div>
        </div>

        {/* 外观 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-400">外观</h2>
          </div>
          <button onClick={() => updateApp({ isDarkMode: !appConfig.isDarkMode })} className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              {appConfig.isDarkMode ? <Moon className="w-5 h-5 text-gray-400" /> : <Sun className="w-5 h-5 text-gray-400" />}
              <span className="text-white">深色模式</span>
            </div>
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${appConfig.isDarkMode ? 'bg-purple-600' : 'bg-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${appConfig.isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>

        {/* 关于 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-400">关于</h2>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Info className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-white">Audiobookshelf Player</p>
                <p className="text-xs text-gray-500">版本 {__APP_VERSION__}</p>
              </div>
            </div>
            <button onClick={handleCheckUpdate} disabled={updateStatus === '检查中...'}
              className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${updateStatus === '检查中...' ? 'animate-spin' : ''}`} />
              {updateStatus || '检查更新'}
            </button>
          </div>
        </div>

        {/* 缓存管理 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-medium text-gray-400">缓存管理</h2>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white text-sm">音频缓存</p>
                <p className="text-xs text-gray-500 mt-1">
                  {cacheInfo.entries > 0
                    ? `${cacheInfo.entries} 个章节，约 ${cacheInfo.totalMB} MB`
                    : '当前无缓存'}
                </p>
              </div>
              <button onClick={() => {
                AudioCache.getInstance().clear();
                refreshCacheInfo();
              }} disabled={cacheInfo.entries === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium
                  hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />清除缓存
              </button>
            </div>
            <p className="text-xs text-gray-600">缓存由 LRU 自动管理（上限 300MB），通常无需手动清理。如遇到章节切换卡顿可尝试。</p>
          </div>
        </div>

        {/* 播放器日志 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-medium text-gray-400">播放器日志</h2>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-400">
                {logs.length > 0
                  ? `${logs.length} 条记录 · 最近 ${logs[logs.length - 1]?.timestamp || '-'}`
                  : '暂无日志'}
              </p>
              <button onClick={() => setShowLogs(true)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  logs.length > 0 ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/5 text-gray-600'
                }`}
              >
                {logs.length > 0 ? '查看' : '空闲'}
              </button>
            </div>
            <p className="text-xs text-gray-600">播放、章节切换、片头片尾跳过、后台恢复等关键事件。</p>
          </div>
        </div>

        {/* 日志查看面板 */}
        <SlideUpPanel visible={showLogs} onClose={() => setShowLogs(false)} title={`播放器日志 (${logs.length})`}>
          <LogViewer logs={logs} filter={logFilter} onFilterChange={setLogFilter}
            onClear={() => { clearLogs(); setLogs([]); }}
          />
        </SlideUpPanel>

        {/* 登出 */}
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-500 font-medium py-4 rounded-2xl hover:bg-red-500/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />退出登录
        </button>
      </div>
    </div>
  );
}
