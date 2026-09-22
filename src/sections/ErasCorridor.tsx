import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ERAS, type EraData } from '@/data/eras';
import type { Language, SiteCopy } from '@/data/i18n';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface ErasCorridorProps {
  copy: SiteCopy['erasCorridor'];
  language: Language;
}

export function ErasCorridor({ copy, language }: ErasCorridorProps) {
  const containerRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const bgHueRef = useRef<HTMLDivElement>(null);
  const [activeEraIndex, setActiveEraIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    const bgHue = bgHueRef.current;
    if (!container || !track || !bgHue) return;

    const ctx = gsap.matchMedia();
    ctx.add('(min-width: 768px)', () => {
      const getScrollAmount = () => {
        return -(track.scrollWidth - window.innerWidth + 80);
      };

      // Main Horizontal Corridor Timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'eras-corridor',
          trigger: container,
          start: 'top top',
          end: () => `+=${Math.max(window.innerHeight * 3, track.scrollWidth - window.innerWidth + 400)}`,
          pin: true,
          scrub: 0.75,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // Update active era index according to progress
            const idx = Math.min(
              ERAS.length - 1,
              Math.round(self.progress * (track.scrollWidth - window.innerWidth + 80) / ((track.querySelector<HTMLElement>('.era-panel')?.offsetWidth || 400) + (window.innerWidth >= 768 ? 40 : 24)))
            );
            setActiveEraIndex(idx);
          },
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
    });

    return () => ctx.revert();
  }, []);

  const selectEra = (index: number) => {
    const trigger = ScrollTrigger.getById('eras-corridor');
    if (!trackRef.current) return;
    if (!trigger) {
      const card = trackRef.current.querySelectorAll<HTMLElement>('.era-panel')[index];
      trackRef.current.scrollTo({ left: card.offsetLeft - 24, behavior: 'smooth' });
      setActiveEraIndex(index);
      return;
    }
    const cards = trackRef.current.querySelectorAll<HTMLElement>('.era-panel');
    const distance = trackRef.current.scrollWidth - window.innerWidth + 80;
    const progress = Math.min(1, (cards[index].offsetLeft - cards[0].offsetLeft) / distance);
    window.scrollTo({ top: trigger.start + progress * (trigger.end - trigger.start), behavior: 'smooth' });
  };

  const currentEra = ERAS[activeEraIndex] || ERAS[0];

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
            {copy.badge} · {currentEra.year}
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
          const track = event.currentTarget;
          const card = track.querySelector<HTMLElement>('.era-panel');
          if (card) setActiveEraIndex(Math.min(ERAS.length - 1, Math.round(track.scrollLeft / (card.offsetWidth + 24))));
        }}
        className="relative z-10 flex items-center gap-6 md:gap-10 px-6 md:px-14 pb-14 md:pb-16 w-max will-change-transform"
      >
        {ERAS.map((era: EraData, index: number) => {
          const isCurrent = index === activeEraIndex;
          return (
            <article
              key={era.id}
              className={`era-panel group relative flex flex-col justify-between rounded-xl overflow-hidden transition-all duration-500 border border-white/10 ${
                isCurrent ? 'scale-100 shadow-[0_10px_40px_rgba(0,0,0,0.8)]' : 'scale-[0.98] opacity-90'
              }`}
              style={{
                width: 'clamp(320px, 36vw, 540px)',
                height: 'clamp(460px, 58vh, 640px)',
                backgroundColor: '#0c0c0d',
              }}
            >
              {/* Card Image with Parallax Mask */}
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={era.image}
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

                <div className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-sans tracking-[0.18em] text-white/70">
                  {era.year}
                </div>
              </div>

              {/* Card Bottom Information */}
              <div className="relative z-10 p-6 md:p-8 flex flex-col">
                <span className="font-sans text-[10px] tracking-[0.24em] uppercase text-white/60 mb-2">
                  {era.stats.genre[language]} · {era.stats.tracks} {copy.viewTracks}
                </span>

                <h3 className="font-cinzel text-2xl sm:text-3xl md:text-4xl font-normal text-white tracking-[0.04em] leading-tight">
                  {era.name[language]}
                </h3>

                <p className="mt-2.5 font-serif text-xs md:text-sm text-white/80 leading-relaxed font-light line-clamp-2">
                  {era.tagline[language]}
                </p>

                {/* Signature quote quote-mark */}
                <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] font-serif italic text-white/50">
                  <span className="truncate max-w-[85%]">{era.quote[language]}</span>
                  <span className="text-white/30 text-xs">↗</span>
                </div>
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
        <div className="flex items-center gap-1.5 md:gap-2">
          {ERAS.map((era, i) => (
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
          {activeEraIndex + 1} / {ERAS.length}
        </span>
      </div>
    </section>
  );
}
