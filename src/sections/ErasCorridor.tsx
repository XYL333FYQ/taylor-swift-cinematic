import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCatalog, type Album } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import type { Language, SiteCopy } from '@/data/i18n';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

function getClosestEraIndex(container: HTMLElement, track: HTMLElement) {
  const centerX = container.getBoundingClientRect().left + container.clientWidth / 2;
  const cards = track.querySelectorAll<HTMLElement>('.era-panel');
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  cards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - centerX);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function getEraTravelDistance(container: HTMLElement, track: HTMLElement) {
  const lastCard = track.querySelectorAll<HTMLElement>('.era-panel').item(track.querySelectorAll('.era-panel').length - 1);
  if (!lastCard) return 0;

  const currentX = Number(gsap.getProperty(track, 'x')) || 0;
  const cardRect = lastCard.getBoundingClientRect();
  const baseCardCenter = cardRect.left + cardRect.width / 2 - currentX;
  const containerCenter = container.getBoundingClientRect().left + container.clientWidth / 2;

  return Math.max(0, baseCardCenter - containerCenter);
}

interface ErasCorridorProps {
  copy: SiteCopy['erasCorridor'];
  language: Language;
  onPlayAlbum: (albumId: string) => void;
}

export function ErasCorridor({ copy, language, onPlayAlbum }: ErasCorridorProps) {
  const { albums } = useCatalog();
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const bgHueRef = useRef<HTMLDivElement>(null);
  const [activeEraIndex, setActiveEraIndex] = useState(0);
  const activeEraIndexRef = useRef(0);
  useEffect(() => {
    const strip = progressRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && active) strip.scrollTo({ left: active.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }, [activeEraIndex]);

  const syncActiveEraIndex = useCallback((index: number) => {
    if (index === activeEraIndexRef.current) return;
    activeEraIndexRef.current = index;
    setActiveEraIndex(index);
  }, []);
  useEffect(() => {
    if (activeEraIndexRef.current >= albums.length) syncActiveEraIndex(Math.max(0, albums.length - 1));
  }, [albums.length, syncActiveEraIndex]);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    const bgHue = bgHueRef.current;
    if (!container || !track || !bgHue) return;

    const ctx = gsap.matchMedia();
    ctx.add('(min-width: 768px)', () => {
      let measureFrame = 0;
      const measureActiveCard = () => {
        if (measureFrame) return;
        measureFrame = requestAnimationFrame(() => {
          measureFrame = 0;
          syncActiveEraIndex(getClosestEraIndex(container, track));
        });
      };
      const getScrollAmount = () => {
        return -getEraTravelDistance(container, track);
      };

      // Main Horizontal Corridor Timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'eras-corridor',
          trigger: container,
          start: 'top top',
          end: () => `+=${Math.max(window.innerHeight * 3, getEraTravelDistance(container, track) + 300)}`,
          pin: true,
          scrub: 0.75,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: measureActiveCard,
          onRefresh: measureActiveCard,
        },
      });

      // Horizontal track translation
      tl.to(track, {
        x: getScrollAmount,
        ease: 'none',
      });

      // Subtle parallax on card imagery
      const cards = track.querySelectorAll('.era-panel');
      cards.forEach((card) => {
        const img = card.querySelector('.era-panel-img');
        if (img) {
          gsap.fromTo(
            img,
            { x: '5%', scale: 1.12 },
            {
              x: '-5%',
              ease: 'none',
              scrollTrigger: {
                trigger: card,
                containerAnimation: tl,
                start: 'left right',
                end: 'right left',
                scrub: true,
              },
            }
          );
        }
      });

      measureActiveCard();
      return () => {
        if (measureFrame) cancelAnimationFrame(measureFrame);
      };
    });

    return () => ctx.revert();
  }, [syncActiveEraIndex, albums.length]);

  const selectEra = (index: number) => {
    const trigger = ScrollTrigger.getById('eras-corridor');
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    if (!trigger) {
      const card = track.querySelectorAll<HTMLElement>('.era-panel')[index];
      track.scrollTo({ left: card.offsetLeft - 24, behavior: 'smooth' });
      syncActiveEraIndex(index);
      return;
    }
    const cards = track.querySelectorAll<HTMLElement>('.era-panel');
    const currentX = Number(gsap.getProperty(track, 'x')) || 0;
    const cardRect = cards[index].getBoundingClientRect();
    const cardCenter = cardRect.left + cardRect.width / 2 - currentX;
    const containerCenter = container.getBoundingClientRect().left + container.clientWidth / 2;
    const distance = getEraTravelDistance(container, track);
    const progress = distance ? Math.max(0, Math.min(1, (cardCenter - containerCenter) / distance)) : 0;
    window.scrollTo({ top: trigger.start + progress * (trigger.end - trigger.start), behavior: 'smooth' });
    syncActiveEraIndex(index);
  };

  const currentEra = albums[activeEraIndex] || albums[0];

  return (
    <section
      ref={containerRef}
      className="era-corridor relative z-30 flex h-screen w-full flex-col justify-between overflow-hidden bg-[#070707] select-none"
    >
      {/* Dynamic atmospheric ambient lighting that morphs with the current era */}
      <div
        ref={bgHueRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 transition-all duration-700 ease-out opacity-25"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 65% 50%, ${currentEra.color} 0%, transparent 70%)`,
        }}
      />

      {/* Large subtle parallax watermark showing Era title */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 -z-10 font-cinzel text-[18vw] font-bold text-white/[0.025] tracking-tight whitespace-nowrap select-none uppercase"
      >
        {currentEra.watermark}
      </div>

      {/* Corridor Header */}
      <div className="relative z-20 px-6 md:px-14 pt-20 md:pt-24 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="font-sans text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-amber-300/80 mb-2 block">
            {copy.badge}{currentEra.year && ` · ${currentEra.year}`}
          </span>
          <h2 className="font-cinzel text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal text-white tracking-[0.06em]">
            {copy.title}
          </h2>
        </div>
        <p className="font-serif text-xs md:text-sm text-white/50 max-w-sm font-light">
          {copy.subtitle}
        </p>
      </div>

      {/* Horizontal Film Strip Track */}
      <div
        ref={trackRef}
        onScroll={(event) => {
          if (window.innerWidth >= 768) return;
          const container = containerRef.current;
          if (container) syncActiveEraIndex(getClosestEraIndex(container, event.currentTarget));
        }}
        className="relative z-10 flex items-center gap-6 md:gap-10 px-6 md:px-14 pb-14 md:pb-16 w-max will-change-transform"
      >
        {albums.map((era: Album, index: number) => {
          const isCurrent = index === activeEraIndex;
          return (
            <article
              key={era.id}
              className={`era-panel group relative flex flex-col justify-between rounded-xl overflow-hidden transition-all duration-500 border border-white/10 ${
                isCurrent ? 'scale-100 shadow-[0_10px_40px_rgba(0,0,0,0.8)]' : 'scale-[0.98] opacity-90'
              }`}
              style={{
                width: 'min(40vw, 64svh)',
                height: 'min(58svh, 40vw)',
                backgroundColor: '#0c0c0d',
              }}
            >
              {/* Card Image with Parallax Mask */}
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={resolveMediaUrl(era.artwork.presentation)}
                  alt={era.name[language]}
                  className="era-panel-img w-full h-full object-cover filter brightness-[0.72] contrast-[1.05] group-hover:scale-105 group-hover:brightness-[0.88] transition-all duration-700 ease-out"
                />
                {/* Gradient shade overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div
                  className="absolute inset-0 opacity-20 mix-blend-color transition-opacity duration-500 group-hover:opacity-40"
                  style={{ backgroundColor: era.color }}
                />
              </div>

              {/* Card Top Information */}
              <div className="relative z-10 p-6 md:p-8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                    style={{ backgroundColor: era.colorAccent, color: era.colorAccent }}
                  />
                  <span className="font-sans text-[11px] tracking-[0.24em] font-semibold text-white/90 uppercase">
                    ERA {era.number}
                  </span>
                </div>

                {era.year && <div className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-sans tracking-[0.18em] text-white/70">
                  {era.year}
                </div>}
              </div>

              {/* Card Bottom Information */}
              <div className="relative z-10 p-6 md:p-8 flex flex-col">
                <span className="font-sans text-[10px] tracking-[0.24em] uppercase text-white/60 mb-2">
                  {era.genre[language] && `${era.genre[language]} · `}{era.tracks.length} {copy.viewTracks}
                </span>

                <h3 className="font-cinzel text-2xl sm:text-3xl md:text-4xl font-normal text-white tracking-[0.04em] leading-tight">
                  {era.name[language]}
                </h3>

                {era.tagline[language] && <p className="mt-2.5 font-serif text-xs md:text-sm text-white/80 leading-relaxed font-light line-clamp-2">
                  {era.tagline[language]}
                </p>}

                {/* Signature quote quote-mark */}
                {era.quote[language] && <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] font-serif italic text-white/50">
                  <span className="truncate max-w-[85%]">{era.quote[language]}</span>
                  <span className="text-white/30 text-xs">↗</span>
                </div>}

                <button type="button" className="era-play-button" onClick={() => onPlayAlbum(era.id)}>
                  <span>{language === 'zh' ? '在播放器中打开' : 'OPEN IN PLAYER'}</span>
                  <span aria-hidden="true">▶</span>
                </button>
              </div>

              {/* Luminous accent underline */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-500"
                style={{
                  backgroundColor: era.colorAccent,
                  opacity: isCurrent ? 1 : 0.4,
                }}
              />
            </article>
          );
        })}
      </div>

      {/* Progress Dots Indicator */}
      <div className="relative z-20 px-6 md:px-14 pb-6 flex items-center justify-between">
        <div ref={progressRef} className="era-progress-dots flex items-center gap-1.5 md:gap-2">
          {albums.map((era, i) => (
            <button
              type="button"
              aria-label={era.name[language]}
              aria-pressed={i === activeEraIndex}
              onClick={() => selectEra(i)}
              key={era.id}
              className={`cursor-pointer border-0 relative after:absolute after:-inset-y-3 after:inset-x-0 h-1 rounded-full transition-all duration-300 ${
                i === activeEraIndex ? 'w-8 bg-amber-400' : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] tracking-[0.2em] font-sans text-white/40 uppercase">
          {activeEraIndex + 1} / {albums.length}
        </span>
      </div>
    </section>
  );
}
