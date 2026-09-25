import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SiteCopy } from '@/data/i18n';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface SpotlightEraProps {
  copy: SiteCopy['spotlight'];
}

export function SpotlightEra({ copy }: SpotlightEraProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const bgImgRef = useRef<HTMLDivElement>(null);
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const quoteBlockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const bgImg = bgImgRef.current;
    const titleBlock = titleBlockRef.current;
    const quoteBlock = quoteBlockRef.current;
    if (!section || !bgImg || !titleBlock || !quoteBlock) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=160%',
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // Background subtle camera drift
      tl.fromTo(
        bgImg,
        { scale: 1.12, filter: 'brightness(0.35) contrast(1.15)' },
        { scale: 1.0, filter: 'brightness(0.5) contrast(1.1)', duration: 1, ease: 'none' },
        0
      );

      // Title & narrative appear right away
      tl.fromTo(
        titleBlock,
        { opacity: 0, y: 35 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
        0.05
      )
        .to(titleBlock, { opacity: 0.25, y: -20, duration: 0.3 }, 0.45)
        // Quote & Sonic blueprint rise up into focus
        .fromTo(
          quoteBlock,
          { opacity: 0, y: 40, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out' },
          0.48
        )
        .to(quoteBlock, { opacity: 1, duration: 0.3 })
        .to(quoteBlock, { opacity: 0, y: -25, duration: 0.25 }, 0.85);
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-30 flex h-screen w-full items-center justify-center overflow-hidden bg-black select-none text-white"
    >
      {/* Cinematic Spotlight Backdrop */}
      <div
        ref={bgImgRef}
        className="absolute inset-0 w-full h-full bg-cover bg-center will-change-transform"
        style={{ backgroundImage: "url('./theme/taylor/spotlight.webp')" }}
      >
        {/* Dark stage gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-black/60" />
        <div className="absolute inset-0 bg-radial-[circle_at_50%_35%] from-transparent via-black/50 to-black" />
      </div>

      {/* Giant Monochromatic Watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-2vw] top-1/2 -translate-y-1/2 font-cinzel text-[16vw] font-bold text-white/[0.03] tracking-tighter uppercase select-none leading-none"
      >
        SHOWGIRL
      </div>

      {/* Primary Narrative & Title Block */}
      <div
        ref={titleBlockRef}
        className="relative z-10 max-w-4xl px-6 md:px-12 flex flex-col items-start"
      >
        <span className="font-sans text-[11px] tracking-[0.34em] uppercase text-white/50 mb-3 px-3.5 py-1 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
          {copy.badge}
        </span>

        <h2 className="font-cinzel text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-normal lowercase tracking-[-0.03em] leading-[0.9] text-white">
          {copy.eraTitle}
        </h2>

        <p className="mt-4 font-cinzel text-xl sm:text-2xl md:text-3xl text-amber-300/90 font-light tracking-[0.08em]">
          {copy.headline}
        </p>

        <p className="mt-6 font-serif text-sm sm:text-base md:text-lg text-white/70 max-w-2xl leading-relaxed font-light">
          {copy.narrative}
        </p>
      </div>

      {/* Secondary Climax Quote & Sonic Blueprint Block */}
      <div
        ref={quoteBlockRef}
        className="absolute z-20 max-w-3xl px-6 md:px-12 text-center flex flex-col items-center opacity-0 pointer-events-none"
      >
        <blockquote className="font-serif text-2xl sm:text-3xl md:text-5xl italic font-normal text-white/95 leading-tight tracking-[0.02em] drop-shadow-[0_4px_30px_rgba(0,0,0,0.9)]">
          {copy.quote}
        </blockquote>

        <cite className="mt-5 font-sans text-xs tracking-[0.24em] uppercase text-amber-400/80 not-italic block">
          — {copy.quoteAuthor}
        </cite>

        <div className="mt-10 p-5 rounded-xl border border-white/15 bg-black/60 backdrop-blur-md max-w-lg text-left">
          <span className="text-[10px] tracking-[0.24em] font-sans text-white/50 uppercase block mb-1.5">
            {copy.sonicBlueprint}
          </span>
          <p className="font-serif text-xs md:text-sm text-white/80 leading-relaxed font-light">
            {copy.sonicDesc}
          </p>
        </div>
      </div>
    </section>
  );
}
