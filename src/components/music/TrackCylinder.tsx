import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Language } from '@/data/i18n';
import type { Track } from '@/data/catalog';
import { wheelStep } from '@/utils/wheelStep';
import { MusicIcon } from './PlaybackControls';

interface TrackCylinderProps {
  tracks: Track[];
  currentTrackId: string | null;
  isPlaying: boolean;
  language: Language;
  onSelectTrack: (track: Track, source: 'click' | 'scroll') => void;
}

export function TrackCylinder({ tracks, currentTrackId, isPlaying, language, onSelectTrack }: TrackCylinderProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startIndex: 0, dragged: false });
  const wheelAccumulatorRef = useRef(0);
  const wheelReleaseTimerRef = useRef<number | null>(null);
  const lastWheelAtRef = useRef(0);
  const targetIndexRef = useRef(0);
  const selectedIndexRef = useRef(0);
  const tracksRef = useRef(tracks);
  const suppressClickRef = useRef(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rowStep, setRowStep] = useState(44);
  const selectedIndex = Math.max(0, tracks.findIndex((track) => track.id === currentTrackId));
  const focusIndex = previewIndex ?? selectedIndex;
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    if (tracksRef.current !== tracks) {
      tracksRef.current = tracks;
      targetIndexRef.current = selectedIndex;
      setPreviewIndex(null);
      return;
    }
    if (performance.now() - lastWheelAtRef.current < 480 && selectedIndex !== targetIndexRef.current) return;
    targetIndexRef.current = selectedIndex;
    setPreviewIndex(null);
  }, [selectedIndex, tracks]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const active = viewport.querySelector<HTMLElement>('[data-music-focus="true"]');
      if (active) setRowStep(active.getBoundingClientRect().height || 44);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [tracks.length]);

  const wrapIndex = useCallback((index: number) => {
    if (!tracks.length) return 0;
    return ((index % tracks.length) + tracks.length) % tracks.length;
  }, [tracks.length]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (tracks.length < 2 || !event.deltaY) return;
    event.preventDefault();
    const direction = wheelStep(event, wheelAccumulatorRef, event.deltaY);
    if (!direction) return;
    lastWheelAtRef.current = performance.now();
    if (wheelReleaseTimerRef.current !== null) window.clearTimeout(wheelReleaseTimerRef.current);
    const index = wrapIndex(targetIndexRef.current + direction);
    targetIndexRef.current = index;
    setPreviewIndex(index);
    onSelectTrack(tracks[index], 'scroll');
    wheelReleaseTimerRef.current = window.setTimeout(() => {
      targetIndexRef.current = selectedIndexRef.current;
      setPreviewIndex(null);
      wheelReleaseTimerRef.current = null;
    }, 480);
  }, [onSelectTrack, tracks, wrapIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || tracks.length < 2) return;
    dragRef.current = { startY: event.clientY, startIndex: focusIndex, dragged: false };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!(event.buttons & 1)) return;
    const delta = event.clientY - drag.startY;
    if (!drag.dragged && Math.abs(delta) < 6) return;
    if (!drag.dragged) event.currentTarget.setPointerCapture(event.pointerId);
    drag.dragged = true;
    const next = wrapIndex(drag.startIndex - Math.round(delta / rowStep));
    targetIndexRef.current = next;
    setPreviewIndex(next);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.dragged) return;
    const index = wrapIndex(targetIndexRef.current);
    setPreviewIndex(null);
    suppressClickRef.current = true;
    requestAnimationFrame(() => { suppressClickRef.current = false; });
    onSelectTrack(tracks[index], 'scroll');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const index = wrapIndex(selectedIndex + delta);
    if (tracks[index]) onSelectTrack(tracks[index], 'scroll');
  };

  useEffect(() => () => {
    if (wheelReleaseTimerRef.current !== null) window.clearTimeout(wheelReleaseTimerRef.current);
  }, []);

  const maxOffset = Math.min(5, Math.floor(tracks.length / 2));
  const offsets = tracks.length ? Array.from({ length: maxOffset * 2 + 1 }, (_, index) => index - maxOffset) : [];

  return (
    <div
      ref={viewportRef}
      className="music-side-window music-cylinder music-track-cylinder"
      data-music-viewport="tracks"
      role="listbox"
      tabIndex={0}
      aria-label={language === 'zh' ? '曲目滚轮' : 'Track wheel'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { setPreviewIndex(null); targetIndexRef.current = selectedIndex; }}
      onKeyDown={handleKeyDown}
    >
      {offsets.map((offset) => {
        const index = wrapIndex(focusIndex + offset);
        const track = tracks[index];
        const distance = Math.abs(offset);
        const scale = [1, 0.96, 0.91, 0.86, 0.82, 0.78][distance] ?? 0.78;
        const opacity = [1, 0.78, 0.55, 0.34, 0.18, 0.07][distance] ?? 0.07;
        const rowStyle = {
          '--cylinder-y': `${offset * rowStep}px`,
          '--cylinder-scale': scale,
          '--cylinder-opacity': opacity,
          '--cylinder-blur': `${Math.max(0, distance - 1) * 0.28}px`,
          '--cylinder-rotate': `${-offset * 5}deg`,
          '--cylinder-depth': `${-distance * 8}px`,
        } as CSSProperties;
        const isCurrent = offset === 0;
        return (
          <button
            type="button"
            role="option"
            aria-selected={isCurrent}
            key={tracks.length > 10 ? track.id : `${offset}:${track.id}`}
            data-track-row="true"
            data-music-focus={isCurrent ? 'true' : undefined}
            data-current={index === selectedIndex ? 'true' : undefined}
            className={`music-track-wheel-row ${isCurrent ? 'is-focused' : ''}`}
            style={rowStyle}
            onClick={() => {
              if (suppressClickRef.current) return;
              onSelectTrack(track, 'click');
            }}
          >
            <span className="music-track-wheel-number">{String(index + 1).padStart(2, '0')}</span>
            <strong>{track.title}</strong>
            <span className="music-track-wheel-state" aria-hidden="true">
              {index === selectedIndex && isPlaying ? (
                <span className="music-eq"><i /><i /><i /></span>
              ) : isCurrent ? <MusicIcon name="play" /> : ''}
            </span>
          </button>
        );
      })}
      {!tracks.length && <p className="music-cylinder-empty">{language === 'zh' ? '这个时代还没有曲目。' : 'No tracks for this era yet.'}</p>}
    </div>
  );
}
