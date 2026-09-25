import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import type { Language } from '@/data/i18n';
import { findActiveLyric, type LyricLine } from '@/utils/lyrics';
import { wheelStep } from '@/utils/wheelStep';

interface LyricsPanelProps {
  lines: LyricLine[];
  currentTime: number;
  language: Language;
  onSeek: (time: number) => void;
}

interface LyricCredit {
  kind: string;
  value: string;
}

const CREDIT_LINE = /^\s*(作词人?|作曲|编曲|制作人|writer(?:s)?|lyricist|lyrics|composer(?:s)?|arranger|producer|written by|music by)\s*[:：]\s*(.+)$/i;

function parseCredit(text: string): LyricCredit | null {
  const match = CREDIT_LINE.exec(text);
  return match ? { kind: match[1].toLowerCase(), value: match[2].trim() } : null;
}

function creditLabel(kind: string, language: Language) {
  if (language === 'zh') {
    if (kind.startsWith('作词') || kind === 'writer' || kind === 'writers' || kind === 'lyricist' || kind === 'lyrics' || kind === 'written by') return '作词';
    if (kind === '作曲' || kind === 'composer' || kind === 'composers' || kind === 'music by') return '作曲';
    if (kind === '编曲' || kind === 'arranger') return '编曲';
    return '制作';
  }
  if (kind.startsWith('作词') || kind === 'writer' || kind === 'writers' || kind === 'lyricist' || kind === 'lyrics' || kind === 'written by') return 'WORDS';
  if (kind === '作曲' || kind === 'composer' || kind === 'composers' || kind === 'music by') return 'MUSIC';
  if (kind === '编曲' || kind === 'arranger') return 'ARRANGEMENT';
  return 'PRODUCTION';
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

function distanceOpacity(distance: number) {
  if (distance === 0) return 1;
  if (distance === 1) return 0.5;
  if (distance === 2) return 0.25;
  return 0.14;
}

function distanceScale(distance: number) {
  if (distance === 0) return 1;
  if (distance === 1) return 0.985;
  if (distance === 2) return 0.97;
  return 0.955;
}

export function LyricsPanel({ lines, currentTime, language, onSeek }: LyricsPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startIndex: 0, dragged: false });
  const wheelAccumulatorRef = useRef(0);
  const suppressClickRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [metrics, setMetrics] = useState({ height: 0, rowStep: 76 });

  const { lyricLines, credits } = useMemo(() => {
    const lyricLines: LyricLine[] = [];
    const credits: LyricCredit[] = [];
    for (const line of lines) {
      const credit = parseCredit(line.text);
      if (credit) credits.push(credit);
      else lyricLines.push(line);
    }
    return { lyricLines, credits };
  }, [lines]);

  const hasTimestamps = lyricLines.length > 0 && lyricLines.every((line) => Number.isFinite(line.timeMs));
  const activeIndex = hasTimestamps ? findActiveLyric(lyricLines, currentTime * 1000) : -1;
  const focusIndex = previewIndex === null ? Math.max(activeIndex, 0) : clampIndex(previewIndex, lyricLines.length);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const scheduleReturnToCurrent = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      setPreviewIndex(null);
      idleTimerRef.current = null;
    }, 3000);
  }, [clearIdleTimer]);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const lyricsWindow = viewport.querySelector<HTMLElement>('[data-lyrics-window="timed"]');
      const row = viewport.querySelector<HTMLElement>('[data-lyric-row="true"]');
      const height = (lyricsWindow ?? viewport).getBoundingClientRect().height;
      const rowStep = row?.offsetHeight || 76;
      setMetrics((current) => current.height === height && current.rowStep === rowStep ? current : { height, rowStep });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const lyricsWindow = viewport.querySelector<HTMLElement>('[data-lyrics-window="timed"]');
    if (lyricsWindow) observer.observe(lyricsWindow);
    return () => observer.disconnect();
  }, [hasTimestamps, lyricLines.length]);

  const moveFocus = (nextIndex: number) => {
    if (!lyricLines.length) return;
    setPreviewIndex(clampIndex(nextIndex, lyricLines.length));
    scheduleReturnToCurrent();
  };

  const seekToIndex = (index: number) => {
    const line = lyricLines[index];
    if (line && Number.isFinite(line.timeMs)) {
      moveFocus(index);
      onSeek((line.timeMs as number) / 1000);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!hasTimestamps || lyricLines.length < 2 || !event.deltaY) return;
    event.preventDefault();
    const direction = wheelStep(event.nativeEvent, wheelAccumulatorRef, event.deltaY);
    if (direction) moveFocus(focusIndex + direction);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !hasTimestamps || lyricLines.length < 2) return;
    dragRef.current = { startY: event.clientY, startIndex: focusIndex, dragged: false };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!(event.buttons & 1)) return;
    const delta = event.clientY - drag.startY;
    if (!drag.dragged && Math.abs(delta) < 7) return;
    if (!drag.dragged) event.currentTarget.setPointerCapture(event.pointerId);
    drag.dragged = true;
    moveFocus(drag.startIndex - Math.round(delta / metrics.rowStep));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.dragged) return;
    suppressClickRef.current = true;
    requestAnimationFrame(() => { suppressClickRef.current = false; });
    scheduleReturnToCurrent();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasTimestamps) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(focusIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveFocus(event.key === 'Home' ? 0 : lyricLines.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      seekToIndex(focusIndex);
    }
  };

  const trackY = metrics.height * 0.42 - (focusIndex + 0.5) * metrics.rowStep;
  const trackStyle = { '--lyrics-track-y': trackY + 'px' } as CSSProperties;
  const firstVisibleIndex = Math.max(0, focusIndex - 5);
  const lastVisibleIndex = Math.min(lyricLines.length - 1, focusIndex + 5);
  const visibleIndexes = hasTimestamps && lyricLines.length ? Array.from({ length: lastVisibleIndex - firstVisibleIndex + 1 }, (_, index) => firstVisibleIndex + index) : [];
  const isChinese = language === 'zh';

  return (
    <div
      ref={viewportRef}
      className="music-side-window music-cylinder music-lyrics-panel"
      data-lyrics-mode={hasTimestamps ? 'timed' : 'static'}
      data-measured={metrics.height > 0 ? 'true' : 'false'}
      aria-label={isChinese ? '动态歌词' : 'Dynamic lyrics'}
    >
      <div className="music-lyrics-toolbar">
        <span>{isChinese ? '歌词' : 'LYRICS'}</span>
        {credits.length > 0 && (
          <button
            type="button"
            className="music-lyrics-info-button"
            aria-expanded={showCredits}
            aria-label={isChinese ? (showCredits ? '隐藏创作信息' : '显示创作信息') : (showCredits ? 'Hide credits' : 'Show credits')}
            onClick={() => setShowCredits((visible) => !visible)}
          >
            <span aria-hidden="true">i</span>{isChinese ? '信息' : 'INFO'}
          </button>
        )}
      </div>

      {hasTimestamps ? (
        <div
          className="music-lyrics-window"
          data-lyrics-window="timed"
          role="listbox"
          tabIndex={0}
          aria-label={isChinese ? '按播放进度同步的歌词' : 'Lyrics synced to playback'}
          aria-activedescendant={'music-lyric-option-' + focusIndex}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragRef.current.dragged = false; scheduleReturnToCurrent(); }}
          onKeyDown={handleKeyDown}
        >
          <div className="music-lyrics-track" style={trackStyle}>
            {visibleIndexes.map((index) => {
              const line = lyricLines[index];
              const distance = Math.abs(index - focusIndex);
              const rowStyle = {
                '--lyric-row-top': index * metrics.rowStep + 'px',
                '--lyric-row-opacity': distanceOpacity(distance),
                '--lyric-row-scale': distanceScale(distance),
              } as CSSProperties;
              return (
                <button
                  key={index}
                  id={'music-lyric-option-' + index}
                  type="button"
                  role="option"
                  aria-selected={index === focusIndex}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  aria-label={line.translation ? line.text + '. ' + line.translation : line.text}
                  tabIndex={-1}
                  data-lyric-row="true"
                  className={'music-lyric-row' + (index === focusIndex ? ' is-active' : '')}
                  style={rowStyle}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    seekToIndex(index);
                  }}
                >
                  <p>{line.text}</p>
                  {line.translation && <span>{line.translation}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="music-lyrics-static-window" data-lyrics-window="static" aria-label={isChinese ? '歌词文本' : 'Lyrics text'}>
          {lyricLines.map((line, index) => (
            <p className="music-lyrics-static-line" key={index}>{line.text}{line.translation && <span>{line.translation}</span>}</p>
          ))}
          {!lyricLines.length && credits.length > 0 && <p className="music-lyrics-static-empty">{isChinese ? '这一首暂时没有歌词。' : 'Lyrics are not available for this track.'}</p>}
        </div>
      )}

      {showCredits && credits.length > 0 && (
        <aside className="music-lyrics-credits" aria-label={isChinese ? '歌曲创作信息' : 'Song credits'}>
          {credits.map((credit, index) => (
            <p key={index}><span>{creditLabel(credit.kind, language)}</span>{credit.value}</p>
          ))}
        </aside>
      )}
    </div>
  );
}
