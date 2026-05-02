import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, List, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { getItem, getCoverUrl, getProgress } from '../api/audiobookshelf';
import { usePlayerStore } from '../controller/playerController';
import { formatTime, formatDuration, getAuthorName, getTitle, getDuration, getChapters, getAudioFileCount, getNarrator } from '../utils/helpers';
import { playerLog } from '../utils/playerLogger';

/* ── 子组件 ────────────────────────────────────────────── */

/** 顶部导航栏 */
function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="Detail-header sticky top-0 z-40 glass bg-black/90 border-b border-white/5">
      <div className="flex items-center gap-4 px-4 h-14">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      </div>
    </header>
  );
}

/** 封面图区域 */
function DetailCover({ itemId, title }: { itemId: string; title: string }) {
  return (
    <div className="Detail-cover relative px-6 pt-5 pb-5">
      <div
        className="mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gray-800"
        style={{ width: '38vw', height: '38vw' }}
      >
        <img src={getCoverUrl(itemId)} alt={title ?? ''} className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

/** 书籍信息（标题、作者、元数据） */
function DetailInfo({ title, author, narrator, duration, fileCount, chapterCount }: {
  title?: string; author?: string; narrator?: string;
  duration?: number; fileCount: number; chapterCount: number;
}) {
  return (
    <div className="Detail-info px-6 text-center mb-5">
      <h1 className="text-xl font-bold text-white mb-1.5 line-clamp-2">{title}</h1>
      <p className="text-gray-400 text-sm">{author}</p>
      {narrator && <p className="text-xs text-gray-500 mt-0.5">朗读: {narrator}</p>}
      <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-400">
        <span>{formatDuration(duration || 0)}</span>
        <span>&middot;</span>
        <span>{fileCount} 个文件</span>
        <span>&middot;</span>
        <span>{chapterCount} 章</span>
      </div>
    </div>
  );
}

/** 播放按钮 */
function PlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="Detail-playBtn px-6 mb-5">
      <button
        onClick={onPlay}
        className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold rounded-2xl py-4 hover:bg-gray-100 active:scale-[0.98] transition-all"
      >
        <Play className="w-5 h-5 fill-current" />开始播放
      </button>
    </div>
  );
}

/** 单个章节行 */
const ChapterRow = React.forwardRef<HTMLButtonElement, {
  chapter: any;
  index: number; isCurrent: boolean; isCompleted: boolean;
  onClick: () => void;
}>(({ chapter, index, isCurrent, isCompleted, onClick }, ref) => {
  const chEnd = chapter.end != null ? chapter.end : (chapter.start + (chapter.duration || 0));
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`ChapterRow w-full flex items-center gap-4 p-3 rounded-xl transition-colors ${
        isCurrent ? 'bg-purple-600/20 ring-1 ring-purple-500/40' : 'hover:bg-white/5 active:bg-white/10'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isCompleted ? 'bg-green-500/20' : isCurrent ? 'bg-purple-600 text-white' : 'bg-white/10'
      }`}>
        {isCompleted ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <span className={`text-sm font-medium ${isCurrent ? 'text-white' : 'text-gray-400'}`}>{index + 1}</span>
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`truncate ${isCurrent ? 'text-purple-300 font-medium' : isCompleted ? 'text-gray-500' : 'text-white'}`}>
          {chapter.title}
        </p>
        <p className={`text-xs ${isCompleted ? 'text-gray-600' : 'text-gray-500'}`}>
          {formatTime(chapter.start)} - {formatTime(chEnd)}
        </p>
      </div>
      {isCurrent && <span className="text-xs text-purple-400 flex-shrink-0">当前</span>}
    </button>
  );
});

/** 章节列表区块 */
function ChapterSection({
  chapters, savedProgress, activeIndex, onSelectChapter,
}: {
  chapters: any[];
  savedProgress: number;
  activeIndex: number;
  onSelectChapter: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // activeIndex 变化时，在章节列表容器内滚动到当前章节（居中）
  useEffect(() => {
    if (!expanded || !currentRef.current || !listRef.current) return;
    requestAnimationFrame(() => {
      const container = listRef.current!;
      const target = currentRef.current!;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset = targetRect.top - containerRect.top - containerRect.height / 2 + targetRect.height / 2;
      container.scrollBy({ top: offset, behavior: 'smooth' });
    });
  }, [expanded, activeIndex]);

  return (
    <div className="Detail-chapters flex flex-col min-h-0 flex-1">
      {/* 章节标题栏（不随列表滚动） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-3 text-white font-medium flex-shrink-0 border-t border-white/5"
      >
        <div className="flex items-center gap-2">
          <List className="w-5 h-5" />章节列表 ({chapters.length})
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div ref={listRef} className="overflow-y-auto flex-1 px-4 pb-4 space-y-1">
          {chapters.map((chapter, index) => {
            const chEnd = chapter.end != null ? chapter.end : (chapter.start + (chapter.duration || 0));
            return (
              <ChapterRow
                key={chapter.id} chapter={chapter} index={index}
                isCurrent={index === activeIndex}
                isCompleted={savedProgress > 0 && chEnd <= savedProgress && index !== activeIndex}
                onClick={() => onSelectChapter(index)}
                ref={index === activeIndex ? currentRef : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const {
    play, switchToChapter,
    libraryItemId: playingItemId, isPlaying,
    currentChapterIndex: storeChapterIndex,
  } = usePlayerStore();

  const [item, setItem] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedProgress, setSavedProgress] = useState(0);

  useEffect(() => {
    if (!itemId) return;
    setIsLoading(true);
    Promise.all([
      getItem(itemId),
      getProgress(itemId).catch(() => ({ currentTime: 0, duration: 0 })),
    ])
      .then(([data, progress]) => {
        setItem(data);
        setSavedProgress(progress.currentTime || 0);
      })
      .catch((err) => console.error('Failed to load item:', err))
      .finally(() => setIsLoading(false));
  }, [itemId]);

  if (isLoading) return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!item) return <div className="h-full flex items-center justify-center text-gray-400">未找到该有声书</div>;

  const chapters = getChapters(item);
  const fileCount = getAudioFileCount(item);

  // 当前高亮章节：同书播放中用 store 实时值，否则从 savedProgress 算
  const isThisBookPlaying = playingItemId === item.id;
  let activeIndex = -1;
  if (isThisBookPlaying) {
    activeIndex = storeChapterIndex;
  } else {
    for (let i = 0; i < chapters.length; i++) {
      const chEnd = chapters[i].end != null ? chapters[i].end : (chapters[i].start + (chapters[i].duration || 0));
      if (savedProgress >= chapters[i].start && savedProgress < chEnd) {
        activeIndex = i; break;
      }
    }
    if (activeIndex === -1 && savedProgress > 0 && chapters.length > 0) activeIndex = chapters.length - 1;
  }

  /** 章节行点击：已播放同书直接切章，否则先 play 再切 */
  const handleSelectChapter = async (index: number) => {
    playerLog('chapter', `[UI] 详情页切章 → 第${index + 1}章`, { itemId: item.id });
    if (isPlaying && isThisBookPlaying) {
      await switchToChapter(index);
    } else {
      await play(item);
      await switchToChapter(index);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 上半：内容自然高度，不压缩不滚动 */}
      <div className="flex-shrink-0">
        <DetailHeader onBack={() => navigate(-1)} />
        <DetailCover itemId={item.id} title={getTitle(item)} />
        <DetailInfo
          title={getTitle(item)}
          author={getAuthorName(item)}
          narrator={getNarrator(item)}
          duration={getDuration(item)}
          fileCount={fileCount}
          chapterCount={chapters.length}
        />
        <PlayButton onPlay={() => {
          playerLog('lifecycle', '[UI] 详情页播放按钮', { itemId: item.id });
          play(item);
        }} />
      </div>

      {/* 下半：紧接上半，占满剩余高度，章节列表在内部滚动 */}
      {chapters.length > 0 && (
        <ChapterSection
          chapters={chapters}
          savedProgress={savedProgress}
          activeIndex={activeIndex}
          onSelectChapter={handleSelectChapter}
        />
      )}
    </div>
  );
}
