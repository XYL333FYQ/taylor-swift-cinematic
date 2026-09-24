import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Language } from '@/data/i18n';
import type { LyricLine } from '@/utils/lyrics';
import { findActiveLyric } from '@/utils/lyrics';
import { wheelStep } from '@/utils/wheelStep';

interface LyricsCylinderProps {
  lines: LyricLine[];
  currentTime: number;
  language: Language;
  onSeek: (time: number) => void;
}

const RETURN_TO_PLAYBACK_DELAY = 3000;
const LYRIC_SCALE_BY_DISTANCE = [1, 0.96, 0.91, 0.86, 0.82, 0.78];
const LYRIC_OPACITY_BY_DISTANCE = [1, 0.93, 0.86, 0.79, 0.72, 0.65];

export function LyricsCylinder({ lines, currentTime, language, onSeek }: LyricsCylinderProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startIndex: 0, dragged: false });
  const wheelAccumulatorRef = useRef(0);
  const returnTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const activeIndex = findActiveLyric(lines, currentTime * 1000);
  const activeIndexRef = useRef(activeIndex);
  const targetIndexRef = useRef(Math.max(0, activeIndex));
  const previewIndexRef = useRef<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rowStep, setRowStep] = useState(74);
  const [wheelHeight, setWheelHeight] = useState(500);
  const focusIndex = previewIndex ?? Math.max(0, activeIndex);
  const currentLine = activeIndex >= 0 ? lines[activeIndex] : undefined;
  activeIndexRef.current = activeIndex;

  const updatePreview = useCallback((index: number | null) => {
    previewIndexRef.current = index;
    setPreviewIndex(index);
  }, []);

  const clampIndex = useCallback((index: number) => {
    return Math.max(0, Math.min(Math.max(0, lines.length - 1), index));
  }, [lines.length]);

  const scheduleReturnToPlayback = useCallback(() => {
    if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current);
    returnTimerRef.current = window.setTimeout(() => {
      targetIndexRef.current = clampIndex(activeIndexRef.current);
      wheelAccumulatorRef.current = 0;
      updatePreview(null);
      returnTimerRef.current = null;
    }, RETURN_TO_PLAYBACK_DELAY);
  }, [clampIndex, updatePreview]);

  useEffect(() => {
    if (previewIndex === null) targetIndexRef.current = clampIndex(activeIndex);
  }, [activeIndex, clampIndex, previewIndex]);

  useEffect(() => {
    targetIndexRef.current = clampIndex(activeIndexRef.current);
    wheelAccumulatorRef.current = 0;
    updatePreview(null);
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
  }, [lines, clampIndex, updatePreview]);

  useLayoutEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const measure = () => {
      const focus = wheel.querySelector<HTMLElement>('[data-lyrics-focus="true"]');
      const first = wheel.querySelector<HTMLElement>('.music-lyric-wheel-row');
      setRowStep(focus?.offsetHeight || first?.offsetHeight || 74);
      setWheelHeight(wheel.clientHeight || 500);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wheel);
    return () => observer.disconnect();
  }, [lines.length]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (lines.length < 2 || !event.deltaY) return;
    event.preventDefault();
    const direction = wheelStep(event, wheelAccumulatorRef, event.deltaY);
    if (!direction) {
      scheduleReturnToPlayback();
      return;
    }
    const index = clampIndex(targetIndexRef.current + direction);
    if (index === targetIndexRef.current && previewIndexRef.current === null) return;
    targetIndexRef.current = index;
    updatePreview(index);
    scheduleReturnToPlayback();
  }, [clampIndex, lines.length, scheduleReturnToPlayback, updatePreview]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.addEventListener('wheel', handleWheel, { passive: false });
    return () => panel.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || lines.length < 2) return;
    dragRef.current = { startY: event.clientY, startIndex: focusIndex, dragged: false };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!(event.buttons & 1)) return;
    const delta = event.clientY - drag.startY;
    if (!drag.dragged && Math.abs(delta) < 6) return;
    if (!drag.dragged) event.currentTarget.setPointerCapture(event.pointerId);
    drag.dragged = true;
    const index = clampIndex(drag.startIndex - Math.round(delta / rowStep));
    if (index !== drag.startIndex || previewIndexRef.current !== null) {
      targetIndexRef.current = index;
      updatePreview(index);
      scheduleReturnToPlayback();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragged) return;
    suppressClickRef.current = true;
    requestAnimationFrame(() => { suppressClickRef.current = false; });
    if (previewIndexRef.current !== null) scheduleReturnToPlayback();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const selectLyric = (index: number) => {
    if (suppressClickRef.current || !lines[index]) return;
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    wheelAccumulatorRef.current = 0;
    targetIndexRef.current = index;
    updatePreview(null);
    onSeek(lines[index].timeMs / 1000);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const index = clampIndex(targetIndexRef.current + delta);
      if (index === targetIndexRef.current && previewIndexRef.current === null) return;
      targetIndexRef.current = index;
      updatePreview(index);
      scheduleReturnToPlayback();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectLyric(focusIndex);
    }
  };

  useEffect(() => () => {
    if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current);
  }, []);

  const firstOffset = previewIndex === null ? 1 : 0;
  const lastOffset = Math.min(
    Math.ceil(wheelHeight / Math.max(1, rowStep)) + 1,
    lines.length - 1 - focusIndex,
  );
  const offsets = lastOffset >= firstOffset
    ? Array.from({ length: lastOffset - firstOffset + 1 }, (_, index) => index + firstOffset)
    : [];

  return (
    <div
      ref={panelRef}
      className="music-side-window music-cylinder music-lyrics-cylinder"
      data-music-viewport="lyrics"
      role="group"
      aria-label={language === 'zh' ? '歌词' : 'Lyrics'}
      aria-live="off"
    >
      {currentLine && (
        <div className="music-lyrics-pinned" data-lyrics-current="true">
          <p>{currentLine.text}</p>
          {currentLine.translation && <span>{currentLine.translation}</span>}
        </div>
      )}
      <div
        ref={wheelRef}
        className="music-lyrics-wheel"
        data-music-viewport="lyrics-wheel"
        role="listbox"
        tabIndex={0}
        aria-label={language === 'zh' ? '浏览并选择歌词' : 'Browse and select lyrics'}
        aria-activedescendant={previewIndex !== null ? `music-lyric-option-${focusIndex}` : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          updatePreview(null);
          targetIndexRef.current = clampIndex(activeIndexRef.current);
        }}
        onKeyDown={handleKeyDown}
      >
        {offsets.map((offset) => {
          const index = focusIndex + offset;
          const line = lines[index];
          if (!line) return null;
          const distance = offset - firstOffset;
          const style = {
            '--lyric-y': `${distance * rowStep}px`,
            '--lyric-scale': LYRIC_SCALE_BY_DISTANCE[distance] ?? 0.78,
            '--lyric-opacity': LYRIC_OPACITY_BY_DISTANCE[distance] ?? 0.65,
            '--lyric-blur': `${Math.min(0.35, Math.max(0, distance - 1) * 0.1)}px`,
            '--lyric-rotate': `${-Math.min(5, distance) * 5}deg`,
            '--lyric-depth': `${-distance * 8}px`,
          } as CSSProperties;
          const isFocused = previewIndex !== null && index === focusIndex;
          const isPlaying = index === activeIndex;
          return (
            <div
              id={`music-lyric-option-${index}`}
              className={`music-lyric-wheel-row ${isFocused ? 'is-active' : ''} ${isPlaying ? 'is-current' : ''}`}
              key={`${line.timeMs}-${index}`}
              role="option"
              aria-selected={isFocused}
              aria-current={isPlaying ? 'true' : undefined}
              data-lyrics-focus={isFocused ? 'true' : undefined}
              data-lyrics-active={isPlaying ? 'true' : undefined}
              data-current={isPlaying ? 'true' : undefined}
              style={style}
              onClick={() => selectLyric(index)}
            >
              <p>{line.text}</p>
              {line.translation && <span>{line.translation}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
