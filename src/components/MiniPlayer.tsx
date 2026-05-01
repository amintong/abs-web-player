import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { getCoverUrl } from '../api/audiobookshelf';
import { getAuthorName } from '../utils/helpers';
import { Config } from '../utils/configManager';
import { useAudioTime } from '../hooks/useAudioTime';

/* ── 子组件 ────────────────────────────────────────────── */

/** 进度条 */
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="MiniPlayer-progress h-0.5 bg-white/10">
      <div
        className="h-full bg-purple-500 transition-all duration-100"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** 封面图 */
function CoverArt({ itemId, title }: { itemId: string; title?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/player')}
      className="MiniPlayer-cover w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0"
    >
      <img src={getCoverUrl(itemId)} alt={title ?? ''} className="w-full h-full object-cover" />
    </button>
  );
}

/** 标题+作者 */
function TrackInfo() {
  const navigate = useNavigate();
  const { currentItem } = usePlayerStore();
  if (!currentItem) return null;
  return (
    <button onClick={() => navigate('/player')} className="MiniPlayer-info flex-1 text-left min-w-0">
      <p className="text-white font-medium text-sm truncate">{currentItem.media?.metadata?.title}</p>
      <p className="text-gray-400 text-xs truncate">{getAuthorName(currentItem)}</p>
    </button>
  );
}

/** 播放控制按钮组 */
function TransportControls() {
  const { isPlaying, pause, resume, skipBackward, skipForward } = usePlayerStore();
  const { skipForwardSeconds, skipBackwardSeconds } = Config.getApp();

  return (
    <div className="MiniPlayer-controls flex items-center gap-1">
      <button
        onClick={() => skipBackward(skipBackwardSeconds)}
        className="p-2 rounded-full hover:bg-white/10 transition-colors"
        aria-label="后退"
      >
        <SkipBack className="w-5 h-5 text-white" />
      </button>
      <button
        onClick={() => isPlaying ? pause() : resume()}
        className="p-3 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform"
        aria-label={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying
          ? <Pause className="w-5 h-5 fill-current" />
          : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>
      <button
        onClick={() => skipForward(skipForwardSeconds)}
        className="p-2 rounded-full hover:bg-white/10 transition-colors"
        aria-label="快进"
      >
        <SkipForward className="w-5 h-5 text-white" />
      </button>
    </div>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function MiniPlayer() {
  const location = useLocation();
  const { isMiniPlayerVisible, currentItem } = usePlayerStore();
  const { currentTime, duration } = useAudioTime();

  if (!isMiniPlayerVisible || !currentItem || location.pathname.endsWith('/player')) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      data-miniplayer="true"
      /*
       * position: fixed + bottom: 0
       * 在 viewport-fit=cover 模式下，fixed 元素的 bottom:0 会直接贴到
       * 物理屏幕最底端（无视安全区），所以 gap-bottom 应该消失。
       * padding-bottom: env(safe-area-inset-bottom) 让内容不被 Home 条遮挡。
       */
      className="MiniPlayer fixed left-0 right-0 z-50 bg-black/95 border-t border-white/10"
      style={{ bottom: 0 }}
    >
      <ProgressBar percent={progress} />

      {/* pb 处理 iPhone 底部安全区域（Home 指示条） */}
      <div
        className="MiniPlayer-body flex items-center gap-3 px-4 py-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <CoverArt itemId={currentItem.id} title={currentItem.media?.metadata?.title} />
        <TrackInfo />
        <TransportControls />
      </div>
    </div>
  );
}
