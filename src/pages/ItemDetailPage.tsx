import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, List, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { getItem, getCoverUrl, getProgress } from '../api/audiobookshelf';
import { usePlayerStore } from '../store/playerStore';
import { ABSMediaItem } from '../types';
import { formatTime, formatDuration, getAuthorName } from '../utils/helpers';

export default function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { play } = usePlayerStore();

  const [item, setItem] = useState<ABSMediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chaptersExpanded, setChaptersExpanded] = useState(true);
  const [savedProgress, setSavedProgress] = useState<number>(0);

  useEffect(() => {
    async function loadItem() {
      if (!itemId) return;
      setIsLoading(true);
      try {
        const [data, progress] = await Promise.all([
          getItem(itemId),
          getProgress(itemId).catch(() => ({ currentTime: 0, duration: 0 })),
        ]);
        setItem(data);
        setSavedProgress(progress.currentTime || 0);
      } catch (error) {
        console.error('Failed to load item:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadItem();
  }, [itemId]);

  const handlePlay = () => {
    if (item) {
      play(item);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        未找到该有声书
      </div>
    );
  }

  const chapters = item.media?.chapters || [];
  const audioFiles = item.media?.audioFiles || [];

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-40 glass bg-black/90 border-b border-white/5">
        <div className="flex items-center gap-4 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        </div>
      </header>

      <div className="relative px-6 pt-6 pb-8">
        <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gray-800">
          <img
            src={getCoverUrl(item.id)}
            alt={item.media?.metadata?.title}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="px-6 text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">{item.media?.metadata?.title}</h1>
        <p className="text-gray-400 mb-1">{getAuthorName(item)}</p>
        {item.media?.metadata?.narratorName && (
          <p className="text-sm text-gray-500">朗读: {item.media.metadata.narratorName}</p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-400">
          <span>{formatDuration(item.media?.duration || 0)}</span>
          <span>•</span>
          <span>{audioFiles.length} 个文件</span>
          <span>•</span>
          <span>{chapters.length} 章</span>
        </div>
      </div>

      <div className="px-6 mb-8">
        <button
          onClick={handlePlay}
          className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold rounded-2xl py-4 hover:bg-gray-100 active:scale-[0.98] transition-all"
        >
          <Play className="w-6 h-6 fill-current" />
          开始播放
        </button>
      </div>

      <div className="px-4">
        <button
          onClick={() => setChaptersExpanded(!chaptersExpanded)}
          className="w-full flex items-center justify-between px-2 py-3 text-white font-medium"
        >
          <div className="flex items-center gap-2">
            <List className="w-5 h-5" />
            章节列表 ({chapters.length})
          </div>
          {chaptersExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {chaptersExpanded && (
          <div className="space-y-1 mt-2">
            {(() => {
              // 找到当前正在播放的章节（start <= savedProgress < end）
              let currentChapterIdx = -1;
              for (let i = 0; i < chapters.length; i++) {
                if (savedProgress >= chapters[i].start && savedProgress < chapters[i].end) {
                  currentChapterIdx = i;
                  break;
                }
              }
              // 如果 currentTime 大于所有 end，标记已读完
              if (currentChapterIdx === -1 && savedProgress > 0 && chapters.length > 0) {
                currentChapterIdx = chapters.length - 1;
              }

              return chapters.map((chapter, index) => {
                const isCompleted = savedProgress > 0 && chapter.end <= savedProgress;
                const isCurrent = index === currentChapterIdx;

                return (
                  <button
                    key={chapter.id}
                    onClick={handlePlay}
                    className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors ${
                      isCurrent
                        ? 'bg-purple-600/20 ring-1 ring-purple-500/40'
                        : 'hover:bg-white/5 active:bg-white/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isCompleted ? 'bg-green-500/20' : isCurrent ? 'bg-purple-600 text-white' : 'bg-white/10'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <span className={`text-sm font-medium ${isCurrent ? 'text-white' : 'text-gray-400'}`}>
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className={`truncate ${isCurrent ? 'text-purple-300 font-medium' : isCompleted ? 'text-gray-500' : 'text-white'}`}>
                        {chapter.title}
                      </p>
                      <p className={`text-xs ${isCompleted ? 'text-gray-600' : 'text-gray-500'}`}>
                        {formatTime(chapter.start)} - {formatTime(chapter.end)}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="text-xs text-purple-400 flex-shrink-0">当前</span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
        )}
      </div>

      {item.media?.metadata?.description && (
        <div className="px-6 mt-8 mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">简介</h2>
          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
            {item.media.metadata.description}
          </p>
        </div>
      )}
    </div>
  );
}
