import { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipBack, SkipForward,
  Moon, ChevronDown, Settings2, List,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useSkipSettings } from '../store/skipSettingsStore';
import { Config } from '../utils/configManager';
import type { BookSkipConfig } from '../utils/configManager';
import { getCoverUrl } from '../api/audiobookshelf';
import { formatTime } from '../utils/helpers';
import SlideUpPanel from '../components/SlideUpPanel';
import { useAudioTime } from '../hooks/useAudioTime';

/* ── 子组件 ────────────────────────────────────────────── */

/** 顶部导航栏（返回 + 标题 + 设置） */
function TopBar({ title, onBack, onOpenSkipConfig }: {
  title?: string;
  onBack: () => void;
  onOpenSkipConfig: () => void;
}) {
  return (
    <div className="Player-topBar flex items-center justify-between px-4 h-14 flex-shrink-0">
      <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
        <ChevronDown className="w-6 h-6 text-white" />
      </button>
      <div className="text-center">
        <p className="text-xs text-gray-400">正在播放</p>
        <p className="text-xs text-gray-500 truncate max-w-[200px]">{title}</p>
      </div>
      <button onClick={onOpenSkipConfig} className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors">
        <Settings2 className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}

/** 封面图 */
function CoverArt({ itemId, title }: { itemId: string; title?: string }) {
  return (
    <div className="Player-cover flex-1 flex flex-col items-center justify-center px-12 pt-4 pb-8">
      <div className="w-full max-w-[400px] aspect-square rounded-2xl overflow-hidden shadow-2xl bg-gray-800">
        <img src={getCoverUrl(itemId)} alt={title ?? ''} className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

/** 章节标题（点击弹出选择器） */
function ChapterLabel({
  currentIndex, total, title, onClick,
}: {
  currentIndex: number; total: number; title?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="Player-chapter text-center px-8 mb-4 w-full">
      <p className="text-sm text-purple-400 mb-1">第 {currentIndex + 1} 章 / {total} 章</p>
      <p className="text-lg font-medium text-white flex items-center justify-center gap-2">
        {title}
        <List className="w-4 h-4 text-gray-400" />
      </p>
    </button>
  );
}

/** 进度条 */
function SeekBar({ currentTime, duration, progress, onSeek }: {
  currentTime: number; duration: number; progress: number;
  onSeek: (t: number) => void;
}) {
  return (
    <div className="Player-seekBar px-8 mb-6">
      <input
        type="range" min={0} max={duration || 100} step={1} value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer seek-bar"
        style={{ background: `linear-gradient(to right, #8b5cf6 ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }}
      />
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

/** 片头/片尾跳过按钮 */
function SkipButtons({ bookSettings, skipSettings, itemId }: {
  bookSettings: BookSkipConfig;
  skipSettings: ReturnType<typeof import('../store/skipSettingsStore').useSkipSettings>;
  itemId: string;
}) {
  return (
    <div className="Player-skipBtns flex items-center justify-center gap-3 mb-4 px-8">
      <button
        onClick={() => skipSettings.toggleBookAutoSkipIntro(itemId)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          bookSettings?.autoSkipIntro ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
        }`}
      >
        <SkipBack className="w-3 h-3" />
        片头{bookSettings?.autoSkipIntro ? '自动' : ''} {bookSettings?.introSeconds || 15}s
      </button>
      <button
        onClick={() => skipSettings.toggleBookAutoSkipOutro(itemId)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          bookSettings?.autoSkipOutro ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
        }`}
      >
        片尾{bookSettings?.autoSkipOutro ? '自动' : ''} {bookSettings?.outroSeconds || 10}s
        <SkipForward className="w-3 h-3" />
      </button>
    </div>
  );
}

/** 播放控制栏 */
function TransportBar({
  isPlaying, playbackRate, sleepActive,
  skipFwdSec, skipBwdSec,
  onTogglePlay, onSpeedClick, onSleepClick,
  onSkipForward, onSkipBackward,
}: {
  isPlaying: boolean; playbackRate: number; sleepActive: boolean;
  skipFwdSec: number; skipBwdSec: number;
  onTogglePlay: () => void; onSpeedClick: () => void; onSleepClick: () => void;
  onSkipForward: (s: number) => void; onSkipBackward: (s: number) => void;
}) {
  return (
    <div className="Player-transport flex items-center justify-between px-8 mb-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <button onClick={onSpeedClick} className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-white">
        {playbackRate}x
      </button>
      <div className="flex items-center gap-4">
        <button onClick={() => onSkipBackward(skipBwdSec)} className="p-3 rounded-full hover:bg-white/10">
          <SkipBack className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={onTogglePlay}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
        >
          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
        </button>
        <button onClick={() => onSkipForward(skipFwdSec)} className="p-3 rounded-full hover:bg-white/10">
          <SkipForward className="w-6 h-6 text-white" />
        </button>
      </div>
      <button onClick={onSleepClick} className="w-14 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
        <Moon className={`w-5 h-5 ${sleepActive ? 'text-purple-400' : 'text-gray-400'}`} />
      </button>
    </div>
  );
}

/** 倍速选择面板 */
function SpeedPicker({ current, speeds, onSelect }: {
  current: number; speeds: readonly number[];
  onSelect: (s: number) => void;
}) {
  return (
    <SlideUpPanel visible onClose={() => {}} title="播放倍速">
      <div className="grid grid-cols-3 gap-3">
        {speeds.map((speed) => (
          <button key={speed} onClick={() => onSelect(speed)}
            className={`py-3 rounded-xl text-center font-medium transition-colors ${current === speed ? 'bg-purple-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >{speed}x</button>
        ))}
      </div>
    </SlideUpPanel>
  );
}

/** 睡眠模式面板 */
function SleepPicker({ remaining, options, onSelect, onClear }: {
  remaining: number | null;
  options: readonly { label: string; value: number | null }[];
  onSelect: (v: number | null) => void;
  onClear: () => void;
}) {
  const subtitle = remaining ? `剩余 ${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}` : '睡眠模式';
  return (
    <SlideUpPanel visible onClose={() => {}} title={subtitle}>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => {
              if (opt.value === null) onClear();
              else onSelect(opt.value);
            }}
            className={`py-3 rounded-xl text-center font-medium transition-colors ${opt.value === null && !remaining ? 'bg-purple-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >{opt.label}</button>
        ))}
      </div>
    </SlideUpPanel>
  );
}

/** 秒数输入框 — 用 type=text+inputMode=numeric 避免 iOS type=number 的 bug */
function SecInput({ value, onChange, max = 300 }: {
  value: string; onChange: (v: string) => void; max?: number;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => {
        // 只允许数字
        const v = e.target.value.replace(/[^0-9]/g, '');
        onChange(v);
      }}
      onBlur={(e) => {
        // 失焦时 clamp 范围
        const n = parseInt(e.target.value) || 0;
        onChange(String(Math.min(n, max)));
      }}
      className="w-16 bg-white/10 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      placeholder="0"
    />
  );
}

/** 跳过配置面板（含 bug fix） */
function SkipConfigPanel({
  visible, onClose, bookSettings, skipSettings, itemId,
}: {
  visible: boolean; onClose: () => void;
  bookSettings: import('../store/skipSettingsStore').BookSkipConfig;
  skipSettings: ReturnType<typeof import('../store/skipSettingsStore').useSkipSettings>;
  itemId: string;
}) {
  const [editIntro, setEditIntro] = useState(String(bookSettings.introSeconds));
  const [editOutro, setEditOutro] = useState(String(bookSettings.outroSeconds));

  useEffect(() => {
    setEditIntro(String(bookSettings.introSeconds));
    setEditOutro(String(bookSettings.outroSeconds));
  }, [bookSettings]);

  if (!visible) return null;

  const handleSave = () => {
    skipSettings.setBookIntro(itemId, parseInt(editIntro) || 0);
    skipSettings.setBookOutro(itemId, parseInt(editOutro) || 0);
    onClose();
  };

  return (
    <SlideUpPanel visible={visible} onClose={onClose} title="跳过设置 · 本书">
      <div className="space-y-4 px-2">
        {/* 片头 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white">跳过片头</span>
            <button
              onClick={() => skipSettings.toggleBookAutoSkipIntro(itemId)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings.autoSkipIntro ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-400'}`}
            >自动{bookSettings.autoSkipIntro ? '开' : '关'}</button>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={120} step={5} value={parseInt(editIntro) || 0}
              onChange={(e) => setEditIntro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #8b5cf6 ${(parseInt(editIntro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editIntro) || 0) / 120 * 100}%)` }} />
            <SecInput value={editIntro} onChange={setEditIntro} max={300} />
            <span className="text-xs text-gray-400">秒</span>
          </div>
        </div>
        {/* 片尾 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white">跳过片尾</span>
            <button
              onClick={() => skipSettings.toggleBookAutoSkipOutro(itemId)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${bookSettings.autoSkipOutro ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}`}
            >自动{bookSettings.autoSkipOutro ? '开' : '关'}</button>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={120} step={5} value={parseInt(editOutro) || 0}
              onChange={(e) => setEditOutro(e.target.value)} className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, #3b82f6 ${(parseInt(editOutro) || 0) / 120 * 100}%, rgba(255,255,255,0.2) ${(parseInt(editOutro) || 0) / 120 * 100}%)` }} />
            <SecInput value={editOutro} onChange={setEditOutro} max={300} />
            <span className="text-xs text-gray-400">秒</span>
          </div>
        </div>
        <button onClick={handleSave}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl py-3 mt-2"
        >保存设置</button>
      </div>
    </SlideUpPanel>
  );
}

/** 章节选择面板 */
function ChapterPicker({
  visible, onClose, chapters, currentIdx, onSelect,
}: {
  visible: boolean; onClose: () => void;
  chapters: Array<{ id: number | string; title: string; start: number; end: number; duration?: number }>;
  currentIdx: number;
  onSelect: (idx: number) => Promise<void>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // 打开时自动滚动到当前章节（居中）
  useEffect(() => {
    if (visible && currentRef.current) {
      // 短暂延迟确保 DOM 已渲染
      requestAnimationFrame(() => {
        currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [visible]);

  return (
    <SlideUpPanel visible={visible} onClose={onClose} title="选择章节">
      <div ref={listRef} className="overflow-y-auto max-h-[40vh] -mx-4 px-4">
        {chapters.map((ch, idx) => (
          <button key={ch.id} ref={idx === currentIdx ? currentRef : undefined} onClick={async () => {
            if (idx !== currentIdx) await onSelect(idx);
            onClose();
          }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 transition-colors text-left ${
              idx === currentIdx
                ? 'bg-purple-600/30 text-purple-300 ring-1 ring-purple-500/50'
                : 'hover:bg-white/10 text-white'
            }`}
          >
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
              idx === currentIdx ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400'
            }`}>{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${idx === currentIdx ? 'text-purple-300' : 'text-white'}`}>
                {ch.title || `章节 ${idx + 1}`}
              </p>
              <p className="text-xs text-gray-500">{formatTime(ch.duration ?? 0)}</p>
            </div>
            {idx === currentIdx && <span className="text-xs text-purple-400 flex-shrink-0">当前</span>}
          </button>
        ))}
      </div>
    </SlideUpPanel>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function PlayerPage() {
  const {
    isPlaying, currentItem, playbackRate,
    chapters, currentChapterIndex, sleepTimeRemaining,
    pause, resume, seek, setPlaybackRate,
    switchToChapter, skipForward, skipBackward, setSleepTimer, clearSleepTimer,
  } = usePlayerStore();

  const { skipForwardSeconds, skipBackwardSeconds } = Config.getApp();
  const { currentTime, duration } = useAudioTime();
  const skipSettings = useSkipSettings();
  const bookSettings = currentItem ? skipSettings.getBookSettings(currentItem.id)! : null;

  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showSleepPicker, setShowSleepPicker] = useState(false);
  const [showSkipConfig, setShowSkipConfig] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);

  const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const sleepOptions = [
    { label: '关闭', value: null as number | null },
    { label: '15 分钟', value: 15 },
    { label: '30 分钟', value: 30 },
    { label: '45 分钟', value: 45 },
    { label: '60 分钟', value: 60 },
    { label: '当前章节结束', value: -1 },
  ];

  if (!currentItem) {
    return (
      <div className="h-full bg-black flex items-center justify-center text-gray-400">
        <p>没有正在播放的内容</p>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-full overflow-hidden bg-black flex flex-col">
      <TopBar
        title={currentItem.media?.metadata?.title}
        onBack={() => window.history.back()}
        onOpenSkipConfig={() => setShowSkipConfig(!showSkipConfig)}
      />

      <CoverArt itemId={currentItem.id} title={currentItem.media?.metadata?.title} />

      {chapters[currentChapterIndex] && (
        <ChapterLabel
          currentIndex={currentChapterIndex} total={chapters.length}
          title={chapters[currentChapterIndex].title}
          onClick={() => setShowChapterPicker(true)}
        />
      )}

      <SeekBar currentTime={currentTime} duration={duration} progress={progress} onSeek={seek} />

      {bookSettings && (
        <SkipButtons bookSettings={bookSettings} skipSettings={skipSettings} itemId={currentItem.id} />
      )}

      <TransportBar
        isPlaying={isPlaying} playbackRate={playbackRate} sleepActive={!!sleepTimeRemaining}
        skipFwdSec={skipForwardSeconds} skipBwdSec={skipBackwardSeconds}
        onTogglePlay={isPlaying ? pause : resume}
        onSpeedClick={() => setShowSpeedPicker(!showSpeedPicker)}
        onSleepClick={() => setShowSleepPicker(!showSleepPicker)}
        onSkipForward={skipForward} onSkipBackward={skipBackward}
      />

      {/* 弹出面板 */}
      {showSpeedPicker && (
        <SpeedPicker current={playbackRate} speeds={playbackSpeeds} onSelect={(s) => { setPlaybackRate(s); setShowSpeedPicker(false); }} />
      )}
      {showSleepPicker && (
        <SleepPicker
          remaining={sleepTimeRemaining} options={sleepOptions}
          onSelect={(v) => {
            if (v === -1) setSleepTimer(Math.ceil((duration - currentTime) / 60));
            else setSleepTimer(v!);
            setShowSleepPicker(false);
          }}
          onClear={() => { clearSleepTimer(); setShowSleepPicker(false); }}
        />
      )}
      <SkipConfigPanel
        visible={showSkipConfig} onClose={() => setShowSkipConfig(false)}
        bookSettings={bookSettings!} skipSettings={skipSettings} itemId={currentItem.id}
      />
      <ChapterPicker
        visible={showChapterPicker} onClose={() => setShowChapterPicker(false)}
        chapters={chapters} currentIdx={currentChapterIndex}
        onSelect={switchToChapter}
      />
    </div>
  );
}
