import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getLibraryItems, getCoverUrl } from '../api/audiobookshelf';
import { formatDuration, getAuthorName, getTitle, getDuration, getNarrator } from '../utils/helpers';

/* ── 子组件 ────────────────────────────────────────────── */

/** 搜索栏 */
function SearchBar({ query, onChange, onClear, onBack }: {
  query: string; onChange: (v: string) => void; onClear: () => void; onBack: () => void;
}) {
  return (
    <header className="Search-header sticky top-0 z-40 bg-black border-b border-white/5">
      <div className="flex items-center gap-4 px-4 h-14">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="搜索有声书..."
            autoFocus
            className="w-full bg-white/10 rounded-full py-2 pl-10 pr-4 text-white placeholder-gray-400 text-sm focus:outline-none focus:bg-white/20 transition-colors"
          />
        </div>
        {query && (
          <button onClick={onClear} className="text-gray-400 text-sm hover:text-white">取消</button>
        )}
      </div>
    </header>
  );
}

/** 搜索结果行项 */
function SearchResultItem({ item }: { item: any }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/item/${item.id}`)} className="Search-resultItem w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors active:bg-white/10">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
        <img src={getCoverUrl(item.id)} alt={getTitle(item)} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <h3 className="text-white font-medium truncate">{getTitle(item)}</h3>
        <p className="text-sm text-gray-400 truncate">{getAuthorName(item)}</p>
        <p className="text-xs text-gray-500 mt-0.5">{formatDuration(getDuration(item))}</p>
      </div>
    </button>
  );
}

/** 加载中 / 空状态 / 占位提示 */
function SearchStatus({ isLoading, hasResults, minLen }: {
  isLoading: boolean; hasResults: boolean; minLen: number;
}) {
  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (hasResults) return null;
  if (minLen >= 1) return <div className="flex flex-col items-center justify-center py-20 text-gray-400"><Search className="w-12 h-12 mb-4 opacity-50" /><p>没有找到相关结果</p></div>;
  return <div className="flex flex-col items-center justify-center py-20 text-gray-500"><Search className="w-12 h-12 mb-4 opacity-30" /><p>输入关键词搜索有声书</p></div>;
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function SearchPage() {
  const navigate = useNavigate();
  const { activeLibraryId } = useAppStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }

    let items = allItems;
    if (items.length === 0 && activeLibraryId) {
      setIsLoading(true);
      try {
        items = await getLibraryItems(activeLibraryId);
        setAllItems(items);
      } catch (e) { console.error('Failed to load items:', e); }
      finally { setIsLoading(false); }
    }

    const qLower = q.toLowerCase();
    setResults(items.filter((item) =>
      getTitle(item).toLowerCase().includes(qLower) ||
      getAuthorName(item).toLowerCase().includes(qLower) ||
      getNarrator(item).toLowerCase().includes(qLower)
    ));
  };

  return (
    <div className="flex flex-col">
      <SearchBar
        query={query} onChange={handleSearch}
        onClear={() => { setQuery(''); setResults([]); }}
        onBack={() => navigate(-1)}
      />

      {!isLoading && results.length > 0 && (
        <div className="space-y-1 px-3 py-2">
          {results.map((item) => <SearchResultItem key={item.id} item={item} />)}
        </div>
      )}

      <SearchStatus isLoading={isLoading} hasResults={results.length > 0} minLen={query.length} />
    </div>
  );
}
