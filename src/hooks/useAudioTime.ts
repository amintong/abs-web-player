/**
 * useAudioTime — 从 audio 元件直接读取实时播放时间
 *
 * - 前台：requestAnimationFrame 60fps 平滑更新（进度条丝滑）
 * - 后台/页面隐藏：rAF 自然停止，零开销
 * - seek / play 事件：自动重启 rAF 循环
 * - 不经过 store，不触发全局重渲染，只有使用此 hook 的组件更新
 */
import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../controller/playerController';

interface AudioTime {
  currentTime: number;   // 当前章节内时间（秒）
  duration: number;      // 当前章节总时长（秒）
}

export function useAudioTime(): AudioTime {
  const [time, setTime] = useState<AudioTime>({ currentTime: 0, duration: 0 });
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);

  useEffect(() => {
    const audio = usePlayerStore.getState()._getAudio();

    const tick = () => {
      setTime({
        currentTime: audio.currentTime || 0,
        duration: audio.duration || 0,
      });
      if (!document.hidden && !audio.paused && audio.src) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
      }
    };

    const startLoop = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      // 先同步一次再开循环（seek 时立即刷新位置）
      setTime({ currentTime: audio.currentTime || 0, duration: audio.duration || 0 });
      rafRef.current = requestAnimationFrame(tick);
    };

    // 初始启动
    startLoop();

    // seek / play / 章节切换后重启循环
    audio.addEventListener('play', startLoop);
    audio.addEventListener('seeking', startLoop);
    audio.addEventListener('seeked', startLoop);
    audio.addEventListener('durationchange', startLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      audio.removeEventListener('play', startLoop);
      audio.removeEventListener('seeking', startLoop);
      audio.removeEventListener('seeked', startLoop);
      audio.removeEventListener('durationchange', startLoop);
    };
  }, []);

  return time;
}
