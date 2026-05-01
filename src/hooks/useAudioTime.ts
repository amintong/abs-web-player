/**
 * useAudioTime — 从 audio 元件直接读取实时播放时间
 *
 * - 前台：requestAnimationFrame 60fps 平滑更新（进度条丝滑）
 * - 后台/页面隐藏：rAF 自然停止，零开销
 * - 恢复：自动续跑
 * - 不经过 store，不触发全局重渲染，只有使用此 hook 的组件更新
 */
import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';

interface AudioTime {
  currentTime: number;   // 当前章节内时间（秒）
  duration: number;      // 当前章节总时长（秒）
}

export function useAudioTime(): AudioTime {
  const [time, setTime] = useState<AudioTime>({ currentTime: 0, duration: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const audio = usePlayerStore.getState()._getAudio();

    const tick = () => {
      setTime({
        currentTime: audio.currentTime || 0,
        duration: audio.duration || 0,
      });
      // 前台 + 正在播放 → 继续跑；否则停止（后台/暂停不浪费 CPU）
      if (!document.hidden && !audio.paused && audio.src) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // audio 是单例，不需要依赖

  return time;
}
