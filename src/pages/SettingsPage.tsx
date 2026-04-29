import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, LogOut, Volume2, Info, TimerReset, SkipBack, SkipForward } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { usePlayerStore } from '../store/playerStore';
import { useSkipSettings } from '../store/skipSettingsStore';
import { logout } from '../api/audiobookshelf';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, isDarkMode, toggleDarkMode, skipForwardSeconds, skipBackwardSeconds, setSkipForwardSeconds, setSkipBackwardSeconds, logout: appLogout } = useAppStore();
  const { playbackRate, setPlaybackRate, volume, setVolume } = usePlayerStore();
  const skipSettings = useSkipSettings();

  const [editDefaultIntro, setEditDefaultIntro] = useState(String(skipSettings.defaultIntroSeconds));
  const [editDefaultOutro, setEditDefaultOutro] = useState(String(skipSettings.defaultOutroSeconds));
  const [editSkipForward, setEditSkipForward] = useState(String(skipForwardSeconds));
  const [editSkipBackward, setEditSkipBackward] = useState(String(skipBackwardSeconds));

  const handleSaveDefaults = () => {
    const intro = parseInt(editDefaultIntro) || 15;
    const outro = parseInt(editDefaultOutro) || 10;
    skipSettings.setDefaultIntro(intro);
    skipSettings.setDefaultOutro(outro);
  };

  const handleSaveSkipTimes = () => {
    const fwd = parseInt(editSkipForward) || 30;
    const bwd = parseInt(editSkipBackward) || 10;
    setSkipForwardSeconds(fwd);
    setSkipBackwardSeconds(bwd);
  };

  const handleLogout = () => {
    logout();
    appLogout();
    navigate('/');
  };

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="min-h-screen">
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
          <button onClick={toggleDarkMode} className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
              {isDarkMode ? <Moon className="w-5 h-5 text-gray-400" /> : <Sun className="w-5 h-5 text-gray-400" />}
              <span className="text-white">深色模式</span>
            </div>
            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-purple-600' : 'bg-gray-600'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>

        {/* 关于 */}
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-medium text-gray-400">关于</h2>
          </div>
          <div className="px-4 py-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-white">Audiobookshelf Player</p>
              <p className="text-xs text-gray-500">版本 1.0.0</p>
            </div>
          </div>
        </div>

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
