import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useAppStore } from '../store/appStore';
import { getCoverUrl } from '../api/audiobookshelf';
import { getAuthorName } from '../utils/helpers';

export default function MiniPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isPlaying, currentItem, currentTime, duration,
    isMiniPlayerVisible, pause, resume, skipBackward, skipForward,
  } = usePlayerStore();
  const { skipForwardSeconds, skipBackwardSeconds } = useAppStore();

  // 在全屏播放器页面不显示迷你播放器（使用 React Router location，适配子路径）
  if (!isMiniPlayerVisible || !currentItem || location.pathname.endsWith('/player')) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="h-0.5 bg-white/10">
        <div className="h-full bg-purple-500 transition-all duration-100" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/player')} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
          <img src={getCoverUrl(currentItem.id)} alt={currentItem.media?.metadata?.title} className="w-full h-full object-cover" />
        </button>

        <button onClick={() => navigate('/player')} className="flex-1 text-left min-w-0">
          <p className="text-white font-medium text-sm truncate">{currentItem.media?.metadata?.title}</p>
          <p className="text-gray-400 text-xs truncate">{getAuthorName(currentItem)}</p>
        </button>

        <div className="flex items-center gap-1">
          <button onClick={() => skipBackward(skipBackwardSeconds)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <SkipBack className="w-5 h-5 text-white" />
          </button>
          <button onClick={() => (isPlaying ? pause() : resume())}
            className="p-3 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <button onClick={() => skipForward(skipForwardSeconds)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <SkipForward className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
