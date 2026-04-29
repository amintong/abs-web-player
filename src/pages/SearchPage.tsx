import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getLibraryItems, getCoverUrl } from '../api/audiobookshelf';
import { ABSMediaItem } from '../types';
import { formatDuration, getAuthorName } from '../utils/helpers';

export default function SearchPage() {
  const navigate = useNavigate();
  const { activeLibraryId } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ABSMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allItems, setAllItems] = useState<ABSMediaItem[]>([]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    // 首次搜索加载全部项目
    if (allItems.length === 0 && activeLibraryId) {
      setIsLoading(true);
      try {
        const items = await getLibraryItems(activeLibraryId);
        setAllItems(items);
      } catch (e) {
        console.error('Failed to load items for search:', e);
      } finally {
        setIsLoading(false);
      }
    }

    const qLower = q.toLowerCase();
    const filtered = allItems.filter(
      (item) =>
        (item.media?.metadata?.title || '').toLowerCase().includes(qLower) ||
        (item.media?.metadata?.authorName || '').toLowerCase().includes(qLower) ||
        (item.media?.metadata?.narratorName || '').toLowerCase().includes(qLower)
    );
    setResults(filtered);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-black border-b border-white/5">
        <div className="flex items-center gap-4 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索有声书..."
              autoFocus
              className="w-full bg-white/10 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 text-sm focus:outline-none focus:bg-white/20 transition-colors"
            />
          </div>
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); }} className="text-gray-400 text-sm hover:text-white">
              取消
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-1 px-3 py-2">
          {results.map((item) => (
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
      ) : query.length >= 2 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Search className="w-12 h-12 mb-4 opacity-50" />
          <p>没有找到相关结果</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Search className="w-12 h-12 mb-4 opacity-30" />
          <p>输入关键词搜索有声书</p>
        </div>
      )}
    </div>
  );
}
