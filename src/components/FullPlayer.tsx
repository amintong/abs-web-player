import { useState, useEffect } from 'react';
import { Play, Pause, SkipBackIcon, SkipForwardIcon, Volume2, VolumeX, Moon, ChevronDown, Settings2 } from 'lucide-react';
import { usePlayerStore } from '../controller/playerController';
import { useSkipSettings } from '../store/skipSettingsStore';
import { getCoverUrl } from '../api/audiobookshelf';
import { formatTime } from '../utils/helpers';
import { useAudioTime } from '../hooks/useAudioTime';
import Slider from './Slider';

export default function FullPlayer() {
  const {
    isPlaying, currentItem, volume, playbackRate,
    chapters, currentChapterIndex, isFullPlayerVisible, sleepTimeRemaining,
    hideFullPlayer, pause, resume, seek, setVolume, setPlaybackRate,
    playNextChapter, playPreviousChapter, setSleepTimer, clearSleepTimer,
    skipIntro, skipOutro,
  } = usePlayerStore();
  const { currentTime, duration } = useAudioTime();

  const skipSettings = useSkipSettings();
  const bookSettings = currentItem ? skipSettings.getBookSettings(currentItem.id) : null;

  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showSleepPicker, setShowSleepPicker] = useState(false);
  const [showSkipConfig, setShowSkipConfig] = useState(false);
  const [editIntro, setEditIntro] = useState('');
  const [editOutro, setEditOutro] = useState('');

  const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const sleepOptions = [
    { label: '关闭', value: null as number | null },
    { label: '15 分钟', value: 15 },
    { label: '30 分钟', value: 30 },
    { label: '45 分钟', value: 45 },
    { label: '60 分钟', value: 60 },
    { label: '当前章节结束', value: -1 },
  ];

  useEffect(() => {
    if (isFullPlayerVisible) {
      document.body.style.overflow = 'hidden';
      if (bookSettings) {
        setEditIntro(String(bookSettings.introSeconds));
        setEditOutro(String(bookSettings.outroSeconds));
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullPlayerVisible, bookSettings]);

  if (!isFullPlayerVisible || !currentItem) return null;

  const currentChapter = chapters[currentChapterIndex];

  const handleSaveSkip = () => {
    const intro = parseInt(editIntro) || 0;
    const outro = parseInt(editOutro) || 0;
    skipSettings.setBookIntro(currentItem.id, intro);
    skipSettings.setBookOutro(currentItem.id, outro);
    setShowSkipConfig(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
        <button onClick={hideFullPlayer} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
          <ChevronDown className="w-6 h-6 text-white" />
        </button>
        <div className="text-center">
          <p className="text-xs text-gray-400">正在播放</p>
        </div>
        <button onClick={() => setShowSkipConfig(!showSkipConfig)} className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors">
          <Settings2 className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* 封面 */}
      <div className="flex-1 flex flex-col items-center justify-center px-12 pt-4 pb-8">
        <div className="w-full max-w-[400px] aspect-square rounded-2xl overflow-hidden shadow-2xl bg-gray-800">
          <img src={getCoverUrl(currentItem.id)} alt={currentItem.media?.metadata?.title} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* 章节信息 */}
      {currentChapter && (
        <div className="text-center px-8 mb-4">
          <p className="text-sm text-purple-400 mb-1">
            第 {currentChapterIndex + 1} 章 / {chapters.length} 章
          </p>
          <p className="text-lg font-medium text-white">{currentChapter.title}</p>
        </div>
      )}

      {/* 进度条 */}
      <div className="px-8 mb-6">
        <Slider value={currentTime} min={0} max={duration || 100} onChange={seek} />
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 跳过片头片尾 + 自动开关 */}
      <div className="flex items-center justify-center gap-3 mb-4 px-8">
        <button
          onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipIntro(currentItem.id); }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            bookSettings?.autoSkipIntro
              ? 'bg-purple-500 text-white'
              : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
          }`}
        >
          <SkipBackIcon className="w-3 h-3" />
          片头 {bookSettings?.autoSkipIntro ? '自动' : ''} {bookSettings?.introSeconds || 15}s
        </button>

        <button
          onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipOutro(currentItem.id); }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            bookSettings?.autoSkipOutro
              ? 'bg-blue-500 text-white'
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          }`}
        >
          片尾 {bookSettings?.autoSkipOutro ? '自动' : ''} {bookSettings?.outroSeconds || 10}s
          <SkipForwardIcon className="w-3 h-3" />
        </button>

        {/* 手动跳过 */}
        <button onClick={skipIntro} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors" title="手动跳过片头">
          <SkipBackIcon className="w-4 h-4 text-gray-400" />
        </button>
        <button onClick={skipOutro} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors" title="手动跳过片尾">
          <SkipForwardIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* 主控制条 */}
      <div className="flex items-center justify-between px-8 mb-4">
        <button onClick={() => setShowSpeedPicker(!showSpeedPicker)}
          className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-white"
        >{playbackRate}x</button>

        <div className="flex items-center gap-4">
          <button onClick={playPreviousChapter} className="p-3 rounded-full hover:bg-white/10 transition-colors">
            <SkipBackIcon className="w-6 h-6 text-white" />
          </button>
          <button onClick={() => (isPlaying ? pause() : resume())}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
          </button>
          <button onClick={playNextChapter} className="p-3 rounded-full hover:bg-white/10 transition-colors">
            <SkipForwardIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        <button onClick={() => setShowSleepPicker(!showSleepPicker)}
          className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <Moon className={`w-5 h-5 ${sleepTimeRemaining ? 'text-purple-400' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* 音量条 */}
      <div className="flex items-center gap-4 px-8 pb-6">
        <button onClick={() => setVolume(volume > 0 ? 0 : 1)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          {volume === 0 ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-gray-400" />}
        </button>
        <Slider value={volume} min={0} max={1} step={0.05} onChange={setVolume} />
      </div>

      {/* 倍速选择器 */}
      {showSpeedPicker && (
        <div className="fixed inset-x-0 bottom-0 z-[110] bg-gray-900 rounded-t-3xl p-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white text-center mb-4">播放倍速</h3>
          <div className="grid grid-cols-3 gap-3">
            {playbackSpeeds.map((speed) => (
              <button key={speed} onClick={() => { setPlaybackRate(speed); setShowSpeedPicker(false); }}
                className={`py-3 rounded-xl text-center font-medium transition-colors ${playbackRate === speed ? 'bg-purple-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >{speed}x</button>
            ))}
          </div>
        </div>
      )}

      {/* 睡眠模式 */}
      {showSleepPicker && (
        <div className="fixed inset-x-0 bottom-0 z-[110] bg-gray-900 rounded-t-3xl p-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white text-center mb-4">
            {sleepTimeRemaining ? `剩余 ${Math.floor(sleepTimeRemaining / 60)}:${(sleepTimeRemaining % 60).toString().padStart(2, '0')}` : '睡眠模式'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {sleepOptions.map((opt) => (
              <button key={opt.label} onClick={() => {
                if (opt.value === null) clearSleepTimer();
                else if (opt.value === -1) setSleepTimer(Math.ceil((duration - currentTime) / 60));
                else setSleepTimer(opt.value);
                setShowSleepPicker(false);
              }} className={`py-3 rounded-xl text-center font-medium transition-colors ${opt.value === null && !sleepTimeRemaining ? 'bg-purple-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >{opt.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* 片头片尾配置面板 */}
      {showSkipConfig && (
        <div className="fixed inset-x-0 bottom-0 z-[110] bg-gray-900 rounded-t-3xl p-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white text-center mb-4">跳过设置 · 本书</h3>

          <div className="space-y-4 px-2">
            {/* 片头 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white">跳过片头</span>
                <button
                  onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipIntro(currentItem.id); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings?.autoSkipIntro ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-400'}`}
                >自动跳过 {bookSettings?.autoSkipIntro ? '开' : '关'}</button>
              </div>
              <div className="flex items-center gap-3">
                <Slider min={0} max={120} step={5} value={parseInt(editIntro) || 0}
                  onChange={(v) => setEditIntro(String(v))} />
                <input type="number" value={editIntro} onChange={(e) => setEditIntro(e.target.value)}
                  className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm text-center" min="0" max="300" />
                <span className="text-xs text-gray-400">秒</span>
              </div>
            </div>

            {/* 片尾 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white">跳过片尾</span>
                <button
                  onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipOutro(currentItem.id); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings?.autoSkipOutro ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}`}
                >自动跳过 {bookSettings?.autoSkipOutro ? '开' : '关'}</button>
              </div>
              <div className="flex items-center gap-3">
                <Slider min={0} max={120} step={5} value={parseInt(editOutro) || 0}
                  onChange={(v) => setEditOutro(String(v))} color="#3b82f6" />
                <input type="number" value={editOutro} onChange={(e) => setEditOutro(e.target.value)}
                  className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm text-center" min="0" max="300" />
                <span className="text-xs text-gray-400">秒</span>
              </div>
            </div>

            <button onClick={handleSaveSkip}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl py-3 mt-2"
            >保存设置</button>
          </div>
        </div>
      )}
    </div>
  );
}
