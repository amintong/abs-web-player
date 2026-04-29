// ====== 实际ABS API数据结构 ======

export interface ABSUser {
  id: string;
  username: string;
  email: string | null;
  type: string;
  token: string;
  mediaProgress: ABSProgress[];
  seriesHideFromContinueListening: any[];
  bookmarks: ABSBookmark[];
  isActive: boolean;
  isLocked: boolean;
}

export interface ABSBookmark {
  libraryItemId: string;
  time: number;
  title: string;
  createdAt: number;
}

export interface ABSLibrary {
  id: string;
  name: string;
  icon: string;
  mediaType: 'book' | 'podcast';
  folders: { id: string; fullPath: string; libraryId: string }[];
  displayOrder: number;
  provider: string;
  settings: any;
}

export interface ABSMediaItem {
  id: string;
  ino?: string;
  libraryId: string;
  folderId: string;
  path: string;
  relPath: string;
  mediaType: 'book' | 'podcast';
  media: {
    id: string;
    metadata: ABSMediaMetadata;
    coverPath: string;
    tags: string[];
    duration: number;
    chapters: ABSChapter[];
    audioFiles: ABSAudioFile[];
  };
  libraryFiles: ABSLibraryFile[];
  numFiles?: number;
  size?: number;
}

export interface ABSMediaMetadata {
  title: string;
  titleIgnorePrefix?: string;
  subtitle?: string | null;
  authorName?: string;
  authorNameLF?: string;
  authors?: { name: string }[];
  narratorName?: string;
  seriesName?: string;
  genres?: string[];
  publishedYear?: string;
  publishedDate?: string | null;
  publisher?: string | null;
  description?: string;
  isbn?: string | null;
  asin?: string | null;
  language?: string | null;
  explicit?: boolean;
  abridged?: boolean;
}

export interface ABSAudioFile {
  index: number;
  ino: string;
  metadata: {
    filename: string;
    ext: string;
    path: string;
    relPath: string;
    size: number;
  };
  addedAt: number;
  updatedAt: number;
  duration: number;
  bitRate: number;
  format: string;
  codec: string;
  mimeType: string;
  channels: number;
  language: string;
  chapters: any[];
  embeddedCoverArt: string;
}

export interface ABSLibraryFile {
  ino: string;
  metadata: {
    filename: string;
    ext: string;
    path: string;
    relPath: string;
    size: number;
  };
  isSupplementary: boolean | null;
  fileType: 'audio' | 'image' | string;
}

export interface ABSChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface ABSProgress {
  id: string;
  userId: string;
  libraryItemId: string;
  episodeId: string | null;
  mediaItemId: string;
  mediaItemType: string;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  hideFromContinueListening: boolean;
  lastUpdate: number;
  startedAt: number;
  finishedAt: string | null;
}
