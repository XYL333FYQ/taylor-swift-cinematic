import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SiteCopy } from '@/data/i18n';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface FinaleOutroProps {
  copy: SiteCopy['finale'];
  onRestart: () => void;
}

export function FinaleOutro({ copy, onRestart }: FinaleOutroProps) {
  const containerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        content,
        { opacity: 0, y: 50, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 75%',
            end: 'top 25%',
            scrub: 0.8,
          },
        }
      );
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative z-30 flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#040404] px-6 py-24 text-center select-none text-white"
    >
      {/* Background cinematic portrait */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <img
          src="./theme/taylor/finale.webp"
          alt="Taylor Swift finale atmosphere"
          className="w-full h-full object-cover filter grayscale brightness-[0.28] contrast-[1.1] scale-105"
        />
        {/* Deep ambient vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#040404] via-black/50 to-[#040404]" />
        <div className="absolute inset-0 bg-radial-[circle_at_center] from-transparent to-[#040404]/90" />
      </div>

      <div ref={contentRef} className="max-w-3xl flex flex-col items-center">
        {/* Eyebrow badge */}
        <span className="font-sans text-[11px] tracking-[0.38em] uppercase text-amber-300/80 mb-5">
          {copy.badge}
        </span>

        {/* Grand Title */}
        <h2 className="font-cinzel text-4xl sm:text-6xl md:text-7xl font-normal tracking-[0.08em] leading-tight text-white drop-shadow-[0_4px_40px_rgba(0,0,0,0.9)]">
          {copy.title}
        </h2>

        {/* Subtitle */}
        <p className="mt-5 max-w-xl font-serif text-base sm:text-lg text-white/70 leading-relaxed font-light">
          {copy.subtitle}
        </p>

        {/* Signature Tribute Quote */}
        <blockquote className="my-10 max-w-2xl px-6 font-serif italic text-lg sm:text-xl md:text-2xl text-white/90 leading-relaxed border-y border-white/10 py-6">
          {copy.closingQuote}
        </blockquote>

        {/* Replay action button */}
        <button
          type="button"
          onClick={onRestart}
          className="group px-8 py-3.5 rounded-full border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/60 text-white font-sans text-xs tracking-[0.24em] uppercase transition-all duration-300 backdrop-blur-sm cursor-pointer flex items-center gap-3"
        >
          <span>{copy.restartText}</span>
          <span className="inline-block transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
            ↗
          </span>
        </button>

        {/* Minimal Credits / Attribution */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-[10px] font-sans tracking-[0.18em] text-white/40 uppercase">
          <span>{copy.credits.director}</span>
          <span className="hidden sm:inline">·</span>
          <span>{copy.credits.music}</span>
          <span className="hidden sm:inline">·</span>
          <span>{copy.credits.curation}</span>
        </div>
        <a className="photo-credit" href="https://www.taylorswift.com/" target="_blank" rel="noreferrer">Photography & artwork · Taylor Swift official website ↗</a>
        <p className="fan-note">Unofficial fan exhibition · Not affiliated with Taylor Swift. All imagery belongs to its respective owners.</p>
      </div>
    </section>
  );
}
