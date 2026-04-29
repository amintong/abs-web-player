import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Search, Grid, List } from 'lucide-react';
import { getLibraryItems, getCoverUrl } from '../api/audiobookshelf';
import { ABSMediaItem } from '../types';
import { formatDuration, getAuthorName } from '../utils/helpers';

export default function LibraryPage() {
  const { libraryId } = useParams<{ libraryId: string }>();
  const navigate = useNavigate();

  const [items, setItems] = useState<ABSMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState('media.metadata.title');

  useEffect(() => {
    async function loadItems() {
      if (!libraryId) return;
      setIsLoading(true);
      try {
        const data = await getLibraryItems(libraryId, sortBy);
        setItems(data);
      } catch (error) {
        console.error('Failed to load items:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadItems();
  }, [libraryId, sortBy]);

  const filteredItems = items.filter((item) =>
    (item.media?.metadata?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.media?.metadata?.authorName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass bg-black/80 border-b border-white/5">
        <div className="flex items-center gap-4 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索有声书..."
              className="w-full bg-white/10 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 text-sm focus:outline-none focus:bg-white/20 transition-colors"
            />
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            {viewMode === 'grid' ? <List className="w-5 h-5 text-white" /> : <Grid className="w-5 h-5 text-gray-400" />}
          </button>
        </div>
        <div className="flex gap-2 px-4 py-2 overflow-x-auto hide-scrollbar">
          {[
            { value: 'media.metadata.title', label: '标题' },
            { value: 'addedAt', label: '添加时间' },
            { value: 'media.duration', label: '时长' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                sortBy === option.value
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1 px-3 py-2">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/item/${item.id}`)}
              className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors active:bg-white/10"
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                <img
                  src={getCoverUrl(item.id)}
                  alt={item.media?.metadata?.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 text-left min-w-0">
                <h3 className="text-white font-medium truncate">{item.media?.metadata?.title}</h3>
                <p className="text-sm text-gray-400 truncate">{getAuthorName(item)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatDuration(item.media?.duration || 0)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(`/item/${item.id}`)}
              className="group text-left"
            >
              <div className="aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-800">
                <img
                  src={getCoverUrl(item.id)}
                  alt={item.media?.metadata?.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <h3 className="text-sm font-medium text-white truncate group-hover:text-purple-400 transition-colors">
                {item.media?.metadata?.title}
              </h3>
              <p className="text-xs text-gray-400 truncate">{getAuthorName(item)}</p>
            </button>
          ))}
        </div>
      )}

      {filteredItems.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Headphones className="w-12 h-12 mb-4 opacity-50" />
          <p>没有找到有声书</p>
        </div>
      )}
    </div>
  );
}
