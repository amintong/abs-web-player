import { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Moon, ChevronDown, Settings2, List } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useSkipSettings } from '../store/skipSettingsStore';
import { Config } from '../utils/configManager';
import { getCoverUrl } from '../api/audiobookshelf';
import { formatTime } from '../utils/helpers';
import SlideUpPanel from '../components/SlideUpPanel';
import { useAudioTime } from '../hooks/useAudioTime';

export default function PlayerPage() {
  const {
    isPlaying, currentItem, volume, playbackRate,
    chapters, currentChapterIndex, sleepTimeRemaining,
    pause, resume, seek, setVolume, setPlaybackRate,
    switchToChapter, skipForward, skipBackward, setSleepTimer, clearSleepTimer,
  } = usePlayerStore();

  const { skipForwardSeconds, skipBackwardSeconds } = Config.getApp();
  const { currentTime, duration } = useAudioTime();
  const skipSettings = useSkipSettings();
  const bookSettings = currentItem ? skipSettings.getBookSettings(currentItem.id) : null;

  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showSleepPicker, setShowSleepPicker] = useState(false);
  const [showSkipConfig, setShowSkipConfig] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
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
    if (bookSettings) {
      setEditIntro(String(bookSettings.introSeconds));
      setEditOutro(String(bookSettings.outroSeconds));
    }
  }, [bookSettings]);

  if (!currentItem) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-400">
        <p>没有正在播放的内容</p>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentChapter = chapters[currentChapterIndex];

  const handleSaveSkip = () => {
    const intro = parseInt(editIntro) || 0;
    const outro = parseInt(editOutro) || 0;
    skipSettings.setBookIntro(currentItem.id, intro);
    skipSettings.setBookOutro(currentItem.id, outro);
    setShowSkipConfig(false);
  };

  return (
    <div className="h-full overflow-hidden bg-black flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
          <ChevronDown className="w-6 h-6 text-white" />
        </button>
        <div className="text-center">
          <p className="text-xs text-gray-400">正在播放</p>
          <p className="text-xs text-gray-500 truncate max-w-[200px]">{currentItem.media?.metadata?.title}</p>
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

      {/* 章节 - 点击弹出章节选择 */}
      {currentChapter && (
        <button onClick={() => setShowChapterPicker(true)} className="text-center px-8 mb-4 w-full">
          <p className="text-sm text-purple-400 mb-1">
            第 {currentChapterIndex + 1} 章 / {chapters.length} 章
          </p>
          <p className="text-lg font-medium text-white flex items-center justify-center gap-2">
            {currentChapter.title}
            <List className="w-4 h-4 text-gray-400" />
          </p>
        </button>
      )}

      {/* 进度条 */}
      <div className="px-8 mb-6">
        <input type="range" min="0" max={duration || 100} step="1" value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #8b5cf6 ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }} />
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 跳过按钮 */}
      <div className="flex items-center justify-center gap-3 mb-4 px-8">
        <button onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipIntro(currentItem.id); }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            bookSettings?.autoSkipIntro ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
          }`}>
          <SkipBack className="w-3 h-3" />
          片头{bookSettings?.autoSkipIntro ? '自动' : ''} {bookSettings?.introSeconds || 15}s
        </button>
        <button onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipOutro(currentItem.id); }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            bookSettings?.autoSkipOutro ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          }`}>
          片尾{bookSettings?.autoSkipOutro ? '自动' : ''} {bookSettings?.outroSeconds || 10}s
          <SkipForward className="w-3 h-3" />
        </button>
      </div>

      {/* 主控制 - 快进/快退替代上下章节 */}
      <div className="flex items-center justify-between px-8 mb-4">
        <button onClick={() => setShowSpeedPicker(!showSpeedPicker)}
          className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-white"
        >{playbackRate}x</button>
        <div className="flex items-center gap-4">
          <button onClick={() => skipBackward(skipBackwardSeconds)} className="p-3 rounded-full hover:bg-white/10">
            <SkipBack className="w-6 h-6 text-white" />
          </button>
          <button onClick={() => (isPlaying ? pause() : resume())}
            className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
          >{isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}</button>
          <button onClick={() => skipForward(skipForwardSeconds)} className="p-3 rounded-full hover:bg-white/10">
            <SkipForward className="w-6 h-6 text-white" />
          </button>
        </div>
        <button onClick={() => setShowSleepPicker(!showSleepPicker)}
          className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
        ><Moon className={`w-5 h-5 ${sleepTimeRemaining ? 'text-purple-400' : 'text-gray-400'}`} /></button>
      </div>

      {/* 音量 */}
      <div className="flex items-center gap-4 px-8 pb-8" style={{ paddingBottom: '12px' }}>
        <button onClick={() => setVolume(volume > 0 ? 0 : 1)} className="p-2 rounded-full hover:bg-white/10">
          {volume === 0 ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-gray-400" />}
        </button>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #8b5cf6 ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)` }} />
      </div>

      {/* 倍速选择器 */}
      <SlideUpPanel visible={showSpeedPicker} onClose={() => setShowSpeedPicker(false)} title="播放倍速">
        <div className="grid grid-cols-3 gap-3">
          {playbackSpeeds.map((speed) => (
            <button key={speed} onClick={() => { setPlaybackRate(speed); setShowSpeedPicker(false); }}
              className={`py-3 rounded-xl text-center font-medium transition-colors ${playbackRate === speed ? 'bg-purple-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >{speed}x</button>
          ))}
        </div>
      </SlideUpPanel>

      {/* 睡眠模式 */}
      <SlideUpPanel visible={showSleepPicker} onClose={() => setShowSleepPicker(false)}
        title={sleepTimeRemaining ? `剩余 ${Math.floor(sleepTimeRemaining / 60)}:${(sleepTimeRemaining % 60).toString().padStart(2, '0')}` : '睡眠模式'}>
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
      </SlideUpPanel>

      {/* 跳过配置 */}
      <SlideUpPanel visible={showSkipConfig} onClose={() => setShowSkipConfig(false)} title="跳过设置 · 本书">
        <div className="space-y-4 px-2">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white">跳过片头</span>
              <button onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipIntro(currentItem.id); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings?.autoSkipIntro ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-400'}`}
              >自动{bookSettings?.autoSkipIntro ? '开' : '关'}</button>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="120" step="5" value={parseInt(editIntro) || 0}
                onChange={(e) => setEditIntro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #8b5cf6 ${(parseInt(editIntro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editIntro) || 0) / 120 * 100}%)` }} />
              <input type="number" value={editIntro} onChange={(e) => setEditIntro(e.target.value)}
                className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm text-center" min="0" max="300" />
              <span className="text-xs text-gray-400">秒</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white">跳过片尾</span>
              <button onClick={() => { if (currentItem) skipSettings.toggleBookAutoSkipOutro(currentItem.id); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings?.autoSkipOutro ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}`}
              >自动{bookSettings?.autoSkipOutro ? '开' : '关'}</button>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="120" step="5" value={parseInt(editOutro) || 0}
                onChange={(e) => setEditOutro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #3b82f6 ${(parseInt(editOutro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editOutro) || 0) / 120 * 100}%)` }} />
              <input type="number" value={editOutro} onChange={(e) => setEditOutro(e.target.value)}
                className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm text-center" min="0" max="300" />
              <span className="text-xs text-gray-400">秒</span>
            </div>
          </div>
          <button onClick={handleSaveSkip}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl py-3 mt-2">保存设置</button>
        </div>
      </SlideUpPanel>

      {/* 章节选择器 */}
      <SlideUpPanel visible={showChapterPicker} onClose={() => setShowChapterPicker(false)} title="选择章节">
        <div className="overflow-y-auto max-h-[40vh] -mx-4 px-4">
          {chapters.map((ch, idx) => (
            <button key={ch.id} onClick={async () => {
              if (idx !== currentChapterIndex) {
                await switchToChapter(idx);
              }
              setShowChapterPicker(false);
            }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 transition-colors text-left ${
                idx === currentChapterIndex
                  ? 'bg-purple-600/30 text-purple-300 ring-1 ring-purple-500/50'
                  : 'hover:bg-white/10 text-white'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                idx === currentChapterIndex ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400'
              }`}>{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${idx === currentChapterIndex ? 'text-purple-300' : 'text-white'}`}>
                  {ch.title || `章节 ${idx + 1}`}
                </p>
                <p className="text-xs text-gray-500">{formatTime(ch.duration)}</p>
              </div>
              {idx === currentChapterIndex && (
                <span className="text-xs text-purple-400 flex-shrink-0">当前</span>
              )}
            </button>
          ))}
        </div>
      </SlideUpPanel>
    </div>
  );
}
