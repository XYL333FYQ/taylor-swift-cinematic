import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Language } from '@/data/i18n';
import type { Album } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import { wheelStep } from '@/utils/wheelStep';

export function EraCarousel({
  albums,
  selectedAlbumId,
  language,
  isRotation,
  onSelectAlbum,
  onToggleRotation,
}: {
  albums: Album[];
  selectedAlbumId: string;
  language: Language;
  isRotation: boolean;
  onSelectAlbum: (album: Album) => void;
  onToggleRotation: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const hasCenteredRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const wheelReleaseTimerRef = useRef<number | null>(null);
  const lastWheelAtRef = useRef(0);
  const targetIndexRef = useRef(0);
  const targetCopyRef = useRef(1);
  const [selectedCopy, setSelectedCopy] = useState(1);
  const selectedCopyRef = useRef(1);
  const selectedIndex = Math.max(0, albums.findIndex((album) => album.id === selectedAlbumId));
  const selectedIndexRef = useRef(selectedIndex);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const visualIndex = previewIndex ?? selectedIndex;
  selectedIndexRef.current = selectedIndex;
  const [scrollable, setScrollable] = useState(false);

  const centerSelected = useCallback((smooth = true) => {
    const strip = stripRef.current;
    const selected = strip?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!strip || !selected) return;
    const stripRect = strip.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const delta = selectedRect.left + selectedRect.width / 2 - (stripRect.left + stripRect.width / 2);
    strip.scrollTo({ left: strip.scrollLeft + delta, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useLayoutEffect(() => {
    centerSelected(hasCenteredRef.current);
    hasCenteredRef.current = true;
  }, [centerSelected, selectedAlbumId, previewIndex, selectedCopy]);

  useEffect(() => {
    if (performance.now() - lastWheelAtRef.current < 480 && selectedIndex !== targetIndexRef.current) return;
    targetIndexRef.current = selectedIndex;
    targetCopyRef.current = selectedCopyRef.current;
    setPreviewIndex(null);
  }, [selectedIndex]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(() => {
      setScrollable(strip.scrollWidth > strip.clientWidth + 2);
      centerSelected(false);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [centerSelected]);

  const rebaseCopyToCenter = useCallback((copy: number, index: number) => {
    const strip = stripRef.current;
    if (!strip || copy === 1) return;
    const current = strip.querySelector<HTMLElement>(`[data-era-copy="${copy}"][data-era-index="${index}"]`);
    const center = strip.querySelector<HTMLElement>(`[data-era-copy="1"][data-era-index="${index}"]`);
    if (current && center) strip.scrollLeft += center.getBoundingClientRect().left - current.getBoundingClientRect().left;
    targetCopyRef.current = 1;
    selectedCopyRef.current = 1;
    setSelectedCopy(1);
  }, []);

  const moveSelected = useCallback((step: number) => {
    if (!albums.length) return;
    const current = targetIndexRef.current;
    if (targetCopyRef.current !== 1 && (current + step < 0 || current + step >= albums.length)) {
      rebaseCopyToCenter(targetCopyRef.current, current);
      targetCopyRef.current = 1;
    }
    const rawIndex = current + step;
    const cycle = Math.floor(rawIndex / albums.length);
    const next = ((rawIndex % albums.length) + albums.length) % albums.length;
    const nextCopy = targetCopyRef.current + cycle;
    targetIndexRef.current = next;
    targetCopyRef.current = nextCopy;
    selectedCopyRef.current = nextCopy;
    setSelectedCopy(nextCopy);
    setPreviewIndex(next);
    onSelectAlbum(albums[next]);
  }, [albums, onSelectAlbum, rebaseCopyToCenter]);

  const selectAlbum = useCallback((album: Album, copy: number) => {
    const index = albums.findIndex((item) => item.id === album.id);
    if (index >= 0) targetIndexRef.current = index;
    targetCopyRef.current = copy;
    selectedCopyRef.current = copy;
    setSelectedCopy(copy);
    setPreviewIndex(null);
    onSelectAlbum(album);
    if (album.id === selectedAlbumId) requestAnimationFrame(() => centerSelected(true));
  }, [albums, centerSelected, onSelectAlbum, selectedAlbumId]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const delta = event.deltaX || event.deltaY;
    if (!delta || albums.length < 2) return;
    event.preventDefault();
    const direction = wheelStep(event, wheelAccumulatorRef, delta);
    if (!direction) return;
    lastWheelAtRef.current = performance.now();
    if (wheelReleaseTimerRef.current !== null) window.clearTimeout(wheelReleaseTimerRef.current);
    moveSelected(direction);
    wheelReleaseTimerRef.current = window.setTimeout(() => {
      targetIndexRef.current = selectedIndexRef.current;
      targetCopyRef.current = selectedCopyRef.current;
      setPreviewIndex(null);
      wheelReleaseTimerRef.current = null;
    }, 480);
  }, [albums.length, moveSelected]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.addEventListener('wheel', handleWheel, { passive: false });
    return () => strip.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const rebaseAfterScroll = () => {
      if (selectedCopyRef.current !== 1) rebaseCopyToCenter(selectedCopyRef.current, targetIndexRef.current);
    };
    strip.addEventListener('scrollend', rebaseAfterScroll);
    return () => strip.removeEventListener('scrollend', rebaseAfterScroll);
  }, [rebaseCopyToCenter]);

  useEffect(() => () => {
    if (wheelReleaseTimerRef.current !== null) window.clearTimeout(wheelReleaseTimerRef.current);
  }, []);

  return (
    <section className={`music-era-carousel ${scrollable ? 'has-overflow' : ''}`} aria-label={language === 'zh' ? '时代长廊' : 'Era carousel'}>
      <div className="music-era-carousel-heading">
        <span className="music-era-carousel-kicker">{language === 'zh' ? `${albums.length} 个时代` : `${albums.length} ERAS`}</span>
        <button type="button" className={`music-rotation-button ${isRotation ? 'is-active' : ''}`} onClick={onToggleRotation} aria-pressed={isRotation}>
          {isRotation ? (language === 'zh' ? '停止轮换' : 'STOP ROTATION') : (language === 'zh' ? '时代轮换' : 'ROTATE ERAS')}
        </button>
      </div>
      <div className="music-era-track">
        <button type="button" className="music-era-arrow" onClick={() => moveSelected(-1)} aria-label={language === 'zh' ? '上一个时代' : 'Previous era'}>
          <svg className="music-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="music-era-strip" ref={stripRef} onScroll={() => setScrollable((stripRef.current?.scrollWidth ?? 0) > (stripRef.current?.clientWidth ?? 0) + 2)}>
          {[0, 1, 2].flatMap((copy) => albums.map((album, index) => {
            const rawOffset = (copy - 1) * albums.length + index - visualIndex;
            const offset = albums.length
              ? ((rawOffset + albums.length / 2) % albums.length + albums.length) % albums.length - albums.length / 2
              : 0;
            const distance = Math.abs(offset);
            const style = {
              '--era-scale': Math.max(0.72, 1 - distance * 0.055),
              '--era-opacity': Math.max(0.25, 1 - distance * 0.18),
              '--era-rotate': `${-offset * 4.5}deg`,
              '--era-depth': `${-Math.min(distance, 4) * 9}px`,
              '--era-blur': `${Math.max(0, distance - 1) * 0.3}px`,
            } as CSSProperties;
            const isSelected = copy === selectedCopy && index === visualIndex;
            return (
              <button
                type="button"
                className={`music-era-item ${isSelected ? 'is-selected' : ''}`}
                key={`${copy}:${album.id}`}
                style={style}
                data-selected={isSelected ? 'true' : undefined}
                data-era-copy={copy}
                data-era-index={index}
                aria-selected={isSelected}
                aria-hidden={copy !== 1 ? true : undefined}
                tabIndex={copy === 1 ? 0 : -1}
                aria-label={`${String(index + 1).padStart(2, '0')} ${album.name[language]} ${album.year}`}
                onClick={() => selectAlbum(album, copy)}
              >
                <span className="music-era-artwork"><img src={resolveMediaUrl(album.artwork.cover)} alt="" loading="lazy" /></span>
                <span className="music-era-item-number">{String(index + 1).padStart(2, '0')}</span>
                {album.year && <span className="music-era-item-year">{album.year}</span>}
                <strong>{album.name[language]}</strong>
              </button>
            );
          }))}
        </div>
        <button type="button" className="music-era-arrow" onClick={() => moveSelected(1)} aria-label={language === 'zh' ? '下一个时代' : 'Next era'}>
          <svg className="music-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </section>
  );
}
