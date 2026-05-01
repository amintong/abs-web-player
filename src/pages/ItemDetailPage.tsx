import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, List, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { getItem, getCoverUrl, getProgress } from '../api/audiobookshelf';
import { usePlayerStore } from '../store/playerStore';
import { ABSMediaItem } from '../types';
import { formatTime, formatDuration, getAuthorName } from '../utils/helpers';

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
function DetailCover({ itemId, title }: { itemId: string; title?: string }) {
  return (
    <div className="Detail-cover relative px-6 pt-6 pb-8">
      <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden shadow-2xl bg-gray-800">
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
    <div className="Detail-info px-6 text-center mb-8">
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-gray-400 mb-1">{author}</p>
      {narrator && <p className="text-sm text-gray-500">朗读: {narrator}</p>}
      <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-400">
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
    <div className="Detail-playBtn px-6 mb-8">
      <button
        onClick={onPlay}
        className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold rounded-2xl py-4 hover:bg-gray-100 active:scale-[0.98] transition-all"
      >
        <Play className="w-6 h-6 fill-current" />开始播放
      </button>
    </div>
  );
}

/** 单个章节行 */
const ChapterRow = React.forwardRef<HTMLButtonElement, {
  chapter: import('../types').ABSChapter;
  index: number; isCurrent: boolean; isCompleted: boolean;
  onClick: () => void;
}>(({ chapter, index, isCurrent, isCompleted, onClick }, ref) => {
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
          {formatTime(chapter.start)} - {formatTime(chapter.end)}
        </p>
      </div>
      {isCurrent && <span className="text-xs text-purple-400 flex-shrink-0">当前</span>}
    </button>
  );
});

/** 章节列表区块 */
function ChapterSection({
  chapters, savedProgress, onPlay,
}: {
  chapters: import('../types').ABSChapter[];
  savedProgress: number;
  onPlay: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const currentRef = useRef<HTMLButtonElement>(null);

  // 找当前章节
  let currentIdx = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (savedProgress >= chapters[i].start && savedProgress < chapters[i].end) {
      currentIdx = i; break;
    }
  }
  if (currentIdx === -1 && savedProgress > 0 && chapters.length > 0) currentIdx = chapters.length - 1;

  // 展开时自动滚动到当前章节（居中）
  useEffect(() => {
    if (expanded && currentRef.current) {
      requestAnimationFrame(() => {
        currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [expanded]);

  return (
    <div className="Detail-chapters px-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-3 text-white font-medium"
      >
        <div className="flex items-center gap-2">
          <List className="w-5 h-5" />章节列表 ({chapters.length})
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-1 mt-2">
          {chapters.map((chapter, index) => (
            <ChapterRow
              key={chapter.id} chapter={chapter} index={index}
              isCurrent={index === currentIdx}
              isCompleted={savedProgress > 0 && chapter.end <= savedProgress}
              onClick={onPlay}
              ref={index === currentIdx ? currentRef : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 简介 */
function Description({ text }: { text: string }) {
  return (
    <div className="Description px-6 mt-8 mb-8">
      <h2 className="text-lg font-semibold text-white mb-3">简介</h2>
      <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/* ── 主组件 ────────────────────────────────────────────── */

export default function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { play } = usePlayerStore();

  const [item, setItem] = useState<ABSMediaItem | null>(null);
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

  const chapters = item.media?.chapters || [];
  const audioFiles = item.media?.audioFiles || [];

  return (
    <div className="flex flex-col pb-20">
      <DetailHeader onBack={() => navigate(-1)} />
      <DetailCover itemId={item.id} title={item.media?.metadata?.title} />
      <DetailInfo
        title={item.media?.metadata?.title}
        author={getAuthorName(item)}
        narrator={item.media?.metadata?.narratorName}
        duration={item.media?.duration}
        fileCount={audioFiles.length}
        chapterCount={chapters.length}
      />
      <PlayButton onPlay={() => item && play(item)} />
      {chapters.length > 0 && (
        <ChapterSection chapters={chapters} savedProgress={savedProgress} onPlay={() => item && play(item)} />
      )}
      {item.media?.metadata?.description && <Description text={item.media.metadata.description} />}
    </div>
  );
}
