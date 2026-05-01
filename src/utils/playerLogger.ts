/**
 * 播放器运行日志
 *
 * 内存环形缓冲，保留最近 500 条。
 * 用于 SettingsPage 的"播放器日志"面板，方便调试锁屏/PWA 后台等复杂场景。
 */

export type LogLevel = 'info' | 'warn' | 'error';
export type LogModule = 'lifecycle' | 'chapter' | 'cache' | 'sync' | 'background' | 'sleep' | 'watchdog' | 'system';

export interface LogEntry {
  id: number;
  timestamp: string;       // HH:mm:ss.SSS
  level: LogLevel;
  module: LogModule;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;

let entries: LogEntry[] = [];
let nextId = 0;

/** 订阅者列表（React state setter） */
const listeners = new Set<(logs: LogEntry[]) => void>();

function notify() {
  const snapshot = [...entries];
  listeners.forEach(fn => fn(snapshot));
}

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

/**
 * 写入一条日志（内部用，外部通过下面的便捷方法）
 */
const CONSOLE_STYLES: Record<LogModule, string> = {
  lifecycle:  'color:#4ade80',  // green
  chapter:    'color:#60a5fa',  // blue
  cache:      'color:#a78bfa',  // purple
  sync:       'color:#facc15',  // yellow
  background: 'color:#fb923c',  // orange
  sleep:      'color:#f472b6',  // pink
  watchdog:   'color:#38bdf8',  // sky
  system:     'color:#94a3b8',  // slate
};

function log(level: LogLevel, module: LogModule, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    id: ++nextId,
    timestamp: now(),
    level,
    module,
    message,
    data,
  };
  entries.push(entry);
  // 环形裁剪
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  notify();

  // ── 控制台输出 ──
  const prefix = `%c[${module}]%c ${entry.timestamp} ${message}`;
  const moduleStyle = CONSOLE_STYLES[module] ?? 'color:inherit';
  const resetStyle = 'color:inherit';
  if (level === 'warn') {
    data ? console.warn(prefix, moduleStyle, resetStyle, data) : console.warn(prefix, moduleStyle, resetStyle);
  } else if (level === 'error') {
    data ? console.error(prefix, moduleStyle, resetStyle, data) : console.error(prefix, moduleStyle, resetStyle);
  } else {
    data ? console.log(prefix, moduleStyle, resetStyle, data) : console.log(prefix, moduleStyle, resetStyle);
  }
}

// ====== 公开 API =======

/** 记录 info 日志 */
export function playerLog(module: LogModule, message: string, data?: Record<string, unknown>) {
  log('info', module, message, data);
}

/** 记录 warn 日志 */
export function playerWarn(module: LogModule, message: string, data?: Record<string, unknown>) {
  log('warn', module, message, data);
}

/** 记录 error 日志 */
export function playerError(module: LogModule, message: string, data?: Record<string, unknown>) {
  log('error', module, message, data);
}

/** 获取全部日志快照 */
export function getLogs(): readonly LogEntry[] {
  return [...entries];
}

/** 清空日志 */
export function clearLogs() {
  entries = [];
  nextId = 0;
  notify();
}

/** 订阅日志变化（返回取消订阅函数）—— React 组件用 */
export function subscribeLogs(fn: (logs: LogEntry[]) => void): () => void {
  listeners.add(fn);
  fn([...entries]); // 立即推送当前快照
  return () => { listeners.delete(fn); };
}

