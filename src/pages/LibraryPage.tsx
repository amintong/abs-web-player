import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Search, Grid, List } from 'lucide-react';
import { getLibraryItems, getCoverUrl } from '../api/audiobookshelf';
import { ABSMediaItem } from '../types';
import { formatDuration, getAuthorName } from '../utils/helpers';

/* ── 子组件 ────────────────────────────────────────────── */

/** 顶部导航栏（返回 + 搜索 + 视图切换 + 排序） */
function LibraryHeader({
  searchQuery, onSearchChange,
  viewMode, onToggleView,
  sortBy, onSortChange,
}: {
  searchQuery: string; onSearchChange: (v: string) => void;
  viewMode: 'grid' | 'list'; onToggleView: () => void;
  sortBy: string; onSortChange: (v: string) => void;
}) {
  const navigate = useNavigate();
  const sortOptions = [
    { value: 'media.metadata.title', label: '标题' },
    { value: 'addedAt', label: '添加时间' },
    { value: 'media.duration', label: '时长' },
  ];

  return (
    <header className="Library-header sticky top-0 z-40 glass bg-black/80 border-b border-white/5">
      <div className="flex items-center gap-4 px-4 h-14">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索有声书..."
            className="w-full bg-white/10 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 text-sm focus:outline-none focus:bg-white/20 transition-colors"
          />
        </div>
        <button onClick={onToggleView} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="切换视图">
          {viewMode === 'grid' ? <List className="w-5 h-5 text-white" /> : <Grid className="w-5 h-5 text-gray-400" />}
        </button>
      </div>
      <div className="flex gap-2 px-4 py-2 overflow-x-auto hide-scrollbar">
        {sortOptions.map((opt) => (
          <button key={opt.value} onClick={() => onSortChange(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              sortBy === opt.value ? 'bg-white text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >{opt.label}</button>
        ))}
      </div>
    </header>
  );
}

/** 列表模式行项 */
function ListItem({ item }: { item: ABSMediaItem }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/item/${item.id}`)} className="Library-listItem w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors active:bg-white/10">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
        <img src={getCoverUrl(item.id)} alt={item.media?.metadata?.title ?? ''} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <h3 className="text-white font-medium truncate">{item.media?.metadata?.title}</h3>
        <p className="text-sm text-gray-400 truncate">{getAuthorName(item)}</p>
        <p className="text-xs text-gray-500 mt-0.5">{formatDuration(item.media?.duration || 0)}</p>
      </div>
    </button>
  );
}

/** 网格模式卡片 */
function GridCard({ item }: { item: ABSMediaItem }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/item/${item.id}`)} className="Library-gridCard group text-left">
      <div className="aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-800">
        <img src={getCoverUrl(item.id)} alt={item.media?.metadata?.title ?? ''} className="w-full h-full object-cover" />
      </div>
      <h3 className="text-sm font-medium text-white truncate group-hover:text-purple-400 transition-colors">{item.media?.metadata?.title}</h3>
      <p className="text-xs text-gray-400 truncate">{getAuthorName(item)}</p>
    </button>
  );
}

/** 空状态 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <Headphones className="w-12 h-12 mb-4 opacity-50" />
      <p>没有找到有声书</p>
    </div>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function LibraryPage() {
  const { libraryId } = useParams<{ libraryId: string }>();
  const [items, setItems] = useState<ABSMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState('media.metadata.title');

  useEffect(() => {
    if (!libraryId) return;
    setIsLoading(true);
    getLibraryItems(libraryId, sortBy)
      .then(setItems)
      .catch((err) => console.error('Failed to load items:', err))
      .finally(() => setIsLoading(false));
  }, [libraryId, sortBy]);

  const filteredItems = items.filter((item) =>
    (item.media?.metadata?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.media?.metadata?.authorName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      <LibraryHeader
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        viewMode={viewMode} onToggleView={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        sortBy={sortBy} onSortChange={setSortBy}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1 px-3 py-2">
          {filteredItems.map((item) => <ListItem key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          {filteredItems.map((item) => <GridCard key={item.id} item={item} />)}
        </div>
      )}

      {filteredItems.length === 0 && !isLoading && <EmptyState />}
    </div>
  );
}
