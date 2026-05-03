import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Clock, ChevronRight, Search, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { usePlayerStore } from '../controller/playerController';
import { getRecentlyAdded, getItem, getCoverUrl, getUserProgress } from '../api/audiobookshelf';
import { formatDuration, getAuthorName, getTitle, getDuration } from '../utils/helpers';
import CoverImage from '../components/CoverImage';

/* ── 子组件 ────────────────────────────────────────────── */

/** 页面顶部导航栏 */
function PageHeader() {
  const navigate = useNavigate();
  return (
    <header className="HomePage-header sticky top-0 z-40 glass bg-black/80 border-b border-white/5">
      <div className="flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/search')} aria-label="搜索" className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Search className="w-5 h-5 text-gray-400" />
          </button>
          <button onClick={() => navigate('/settings')} aria-label="设置" className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Settings className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
    </header>
  );
}

/** 继续收听卡片 — 封面 + 进度条 + 标题 */
function ContinueCard({ progress, item, onPlay }: {
  progress: { progress: number };
  item: any;
  onPlay: () => void;
}) {
  const title = getTitle(item);
  return (
    <button onClick={onPlay} className="ContinueCard flex-shrink-0 w-36 group">
      <div className="ContinueCard-cover relative aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-800">
        <CoverImage src={getCoverUrl(item.id)} alt={title} className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
          <div className="h-full bg-purple-500" style={{ width: `${progress.progress * 100}%` }} />
        </div>
      </div>
      <h3 className="text-sm font-medium text-white truncate group-hover:text-purple-400 transition-colors">
        {title}
      </h3>
      {getAuthorName(item) && <p className="text-xs text-gray-400 truncate">{getAuthorName(item)}</p>}
    </button>
  );
}

/** 继续收听区块 */
function ContinueListening({ items, isLoading, onPlay }: {
  items: { progress: { progress: number }; item: any }[];
  isLoading: boolean;
  onPlay: (item: any) => void;
}) {
  // 加载完成且无数据，不占空间
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="HomePage-continue mb-8">
      <div className="flex items-center justify-between px-5 mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">继续收听</h2>
        </div>
      </div>
      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-4 px-5 pb-2">
          {isLoading ? (
            // 骨架屏：3 个占位卡片
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-36">
                <div className="aspect-[3/4] rounded-xl bg-gray-800 animate-pulse mb-2" />
                <div className="h-3 w-24 bg-gray-800 rounded animate-pulse mb-1.5" />
                <div className="h-2.5 w-16 bg-gray-800/60 rounded animate-pulse" />
              </div>
            ))
          ) : (
            items.map(({ progress, item }) => (
              <ContinueCard key={item.id} progress={progress} item={item} onPlay={() => onPlay(item)} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/** 最近添加的行项 */
function MediaItemRow({ item, onClick }: {
  item: any;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="MediaItemRow w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors active:bg-white/10"
    >
      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
        <CoverImage src={getCoverUrl(item.id)} alt={getTitle(item)} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <h3 className="text-white font-medium truncate">{getTitle(item)}</h3>
        <p className="text-sm text-gray-400 truncate">{getAuthorName(item)}</p>
        <p className="text-xs text-gray-500 mt-1">{formatDuration(getDuration(item))}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
    </button>
  );
}

/** 加载中 spinner */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** 最近添加区块 */
function RecentlyAdded({ items, isLoading, libraryId }: {
  items: any[];
  isLoading: boolean;
  libraryId: string;
}) {
  const navigate = useNavigate();
  return (
    <section className="HomePage-recent mb-8">
      <div className="flex items-center justify-between px-5 mb-3">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">最近添加</h2>
        </div>
        <button
          onClick={() => navigate(`/library/${libraryId}`)}
          className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
        >
          查看全部 <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-1 px-3">
          {items.slice(0, 10).map((item) => (
            <MediaItemRow
              key={item.id}
              item={item}
              onClick={() => navigate(`/item/${item.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function HomePage() {
  const navigate = useNavigate();
  const { activeLibraryId } = useAppStore();
  const { play, currentItem } = usePlayerStore();

  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [continueItems, setContinueItems] = useState<{ progress: { progress: number }; item: any }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [continueLoading, setContinueLoading] = useState(true);

  // 从服务端拉取"继续收听"列表，切库时刷新
  useEffect(() => {
    if (!activeLibraryId) return;
    let cancelled = false;
    setContinueLoading(true);
    getUserProgress(activeLibraryId)
      .then(async (progressList) => {
        if (cancelled) return;
        const withTime = progressList.filter(p => p.currentTime > 0);
        const items = await Promise.all(
          withTime.slice(0, 10).map(async (p) => {
            try {
              const item = await getItem(p.itemId);
              return { progress: p, item };
            } catch { return null; }
          })
        );
        if (!cancelled) setContinueItems(items.filter(Boolean) as { progress: { progress: number }; item: any }[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setContinueLoading(false); });
    return () => { cancelled = true; };
  }, [activeLibraryId]);

  // 最近添加 — 只在切换库时加载一次
  useEffect(() => {
    if (!activeLibraryId) return;
    let cancelled = false;
    setIsLoading(true);
    getRecentlyAdded(activeLibraryId, 20)
      .then(recent => { if (!cancelled) setRecentItems(recent); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [activeLibraryId]);

  const handlePlayItem = (item: any) => {
    if (currentItem?.id === item.id) {
      navigate('/player');
    } else {
      play(item);
    }
  };

  return (
    <div className="flex flex-col">
      <PageHeader />

      <ContinueListening
        items={continueItems}
        isLoading={continueLoading}
        onPlay={handlePlayItem}
      />

      <RecentlyAdded
        items={recentItems}
        isLoading={isLoading}
        libraryId={activeLibraryId ?? ''}
      />
    </div>
  );
}
