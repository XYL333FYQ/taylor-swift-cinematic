import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SiteCopy } from '@/data/i18n';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface CylinderPortalProps {
  copy: SiteCopy['portal'];
  imageSrc?: string;
}

export function CylinderPortal({ copy, imageSrc = './img/taylor/era-06.webp' }: CylinderPortalProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const copyBlockRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const imageFrame = imageFrameRef.current;
    const copyBlock = copyBlockRef.current;
    const overlay = overlayRef.current;
    if (!section || !imageFrame || !copyBlock || !overlay) return;

    const ctx = gsap.context(() => {
      // Timeline pinned for seamless cinematic dimensional transition
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // 0% -> 30%: Seamless expansion & immediate text entrance
      tl.fromTo(
        imageFrame,
        { scale: 1.12, filter: 'brightness(0.7) contrast(1.1)' },
        { scale: 1.0, filter: 'brightness(0.55) contrast(1.05)', duration: 0.5, ease: 'power2.out' }
      )
        .fromTo(
          copyBlock,
          { opacity: 0, y: 35 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
          0.08 // Early text arrival: immediate comprehension!
        )
        .to(copyBlock, { opacity: 1, duration: 0.3 }) // Sustained readability
        // 60% -> 100%: Smooth transition out into the Eras Corridor
        .to(copyBlock, { opacity: 0, y: -25, duration: 0.25, ease: 'power2.in' }, 0.7)
        .to(
          overlay,
          { opacity: 0.6, duration: 0.3, ease: 'power2.in' },
          0.75
        );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-30 flex h-screen w-full items-center justify-center overflow-hidden bg-black"
    >
      {/* Seamless full-bleed photograph frame matching the cylinder dive */}
      <div
        ref={imageFrameRef}
        className="absolute inset-0 w-full h-full will-change-transform"
      >
        <img
          src={imageSrc}
          alt="Portal visual transition"
          className="w-full h-full object-cover"
        />
        {/* Cinematic contrast vignette */}
        <div className="absolute inset-0 bg-radial-[circle_at_50%_45%] from-transparent via-black/40 to-black/90" />
      </div>

      {/* Dark overlay for transition into next section */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black opacity-0 pointer-events-none"
      />

      {/* Immediate, high-clarity typography block */}
      <div
        ref={copyBlockRef}
        className="relative z-10 max-w-3xl px-6 text-center text-white flex flex-col items-center select-none"
      >
        <span className="font-sans text-[11px] tracking-[0.38em] uppercase text-amber-300/90 mb-4 px-3 py-1 rounded-full border border-amber-300/30 bg-black/40 backdrop-blur-sm">
          {copy.badge}
        </span>

        <h2 className="font-cinzel text-4xl sm:text-6xl md:text-7xl font-normal tracking-[0.06em] leading-[1.05] text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.9)]">
          {copy.title}
        </h2>

        <p className="mt-6 max-w-xl font-serif text-base sm:text-lg md:text-xl text-white/80 leading-relaxed font-light">
          {copy.description}
        </p>

        <div className="mt-8 flex items-center gap-2 text-[10px] tracking-[0.24em] text-white/50 uppercase font-sans">
          <span>{copy.instruction}</span>
          <span className="inline-block animate-bounce">→</span>
        </div>
      </div>
    </section>
  );
}
