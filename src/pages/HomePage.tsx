import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Clock, ChevronRight, Search, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { usePlayerStore } from '../store/playerStore';
import { getRecentlyAdded, getItem, getCoverUrl } from '../api/audiobookshelf';
import { ABSMediaItem, ABSProgress } from '../types';
import { formatDuration, getAuthorName } from '../utils/helpers';

export default function HomePage() {
  const navigate = useNavigate();
  const { activeLibraryId, mediaProgress } = useAppStore();
  const { play, currentItem } = usePlayerStore();

  const [recentItems, setRecentItems] = useState<ABSMediaItem[]>([]);
  const [continueItems, setContinueItems] = useState<{ progress: ABSProgress; item: ABSMediaItem }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!activeLibraryId) return;
      setIsLoading(true);
      try {
        const recent = await getRecentlyAdded(activeLibraryId, 20);
        setRecentItems(recent);

        // 展示所有有播放进度的记录（不过滤已完成或隐藏）
        const progress = (mediaProgress || []).filter(
          (p) => p.currentTime > 0
        );

        const items = await Promise.all(
          progress.slice(0, 10).map(async (p) => {
            try {
              const item = await getItem(p.libraryItemId);
              return { progress: p, item };
            } catch {
              return null;
            }
          })
        );
        setContinueItems(items.filter(Boolean) as { progress: ABSProgress; item: ABSMediaItem }[]);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [activeLibraryId, mediaProgress]);

  const handlePlayItem = (item: ABSMediaItem) => {
    if (currentItem?.id === item.id) {
      navigate('/player');
    } else {
      play(item);
    }
  };

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-40 glass bg-black/80 border-b border-white/5">
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/search')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <Search className="w-5 h-5 text-gray-400" />
            </button>
            <button onClick={() => navigate('/settings')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <Settings className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </header>

      {/* 继续收听 */}
      {continueItems.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between px-5 mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">继续收听</h2>
            </div>
          </div>
          <div className="overflow-x-auto hide-scrollbar">
            <div className="flex gap-4 px-5 pb-2">
              {continueItems.map(({ progress, item }) => (
                <button key={item.id} onClick={() => handlePlayItem(item)} className="flex-shrink-0 w-36 group">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-800">
                    <img src={getCoverUrl(item.id)} alt={item.media?.metadata?.title} className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                      <div className="h-full bg-purple-500" style={{ width: `${progress.progress * 100}%` }} />
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-white truncate group-hover:text-purple-400 transition-colors">
                    {item.media?.metadata?.title}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">{getAuthorName(item)}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 最近添加 */}
      <section className="mb-8">
        <div className="flex items-center justify-between px-5 mb-3">
          <h2 className="text-lg font-semibold text-white">最近添加</h2>
          <button
            onClick={() => navigate(`/library/${activeLibraryId}`)}
            className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
          >
            查看全部 <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-1 px-3">
            {recentItems.slice(0, 10).map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/item/${item.id}`)}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors active:bg-white/10"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                  <img src={getCoverUrl(item.id)} alt={item.media?.metadata?.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <h3 className="text-white font-medium truncate">{item.media?.metadata?.title}</h3>
                  <p className="text-sm text-gray-400 truncate">{getAuthorName(item)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDuration(item.media?.duration || 0)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
