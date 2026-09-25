import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { Language, SiteCopy } from '@/data/i18n';
import { useCatalog } from '@/data/catalog';

interface HeroIntroProps {
  copy: SiteCopy['hero'];
  language: Language;
  onExploreClick: () => void;
  onPlayRotation: () => void;
}
export function HeroIntro({ copy, language, onExploreClick, onPlayRotation }: HeroIntroProps) {
  const { albums, yearRange } = useCatalog();
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-reveal', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1.5, stagger: 0.13, ease: 'power3.out' });
    }, sectionRef);
    return () => ctx.revert();
  }, []);
  const zh = language === 'zh';
  return (
    <section ref={sectionRef} className="editorial-hero" aria-label={copy.title}>
      <div className="hero-portrait" aria-hidden="true">
        <img src="./theme/taylor/hero.webp" alt="" fetchPriority="high" />
      </div>
      <div className="hero-shade" />
      <div className="hero-edition hero-reveal"><span>THE SONGS WE KEEP</span><span>{yearRange}</span></div>
      <div className="hero-composition">
        <p className="hero-eyebrow hero-reveal"><span />{copy.eyebrow}</p>
        <h1 className="hero-title hero-reveal"><span>Taylor</span><span>Swift<span className="hero-star">✦</span></span></h1>
        <div className="hero-caption hero-reveal"><span className="hero-number">{albums.length}</span><p>{copy.subtitle}</p></div>
        <div className="hero-actions hero-reveal">
          <button onClick={onExploreClick} className="editorial-button">{copy.enterButton}<span>↓</span></button>
          <button type="button" className="hero-music-button" onClick={onPlayRotation}>
            <span className="hero-music-dot" aria-hidden="true" />
            <span>{zh ? `${albums.length} 个时代，轮着唱` : `${albums.length} ERAS, ON REPEAT`}</span>
          </button>
          <a href="#archive">{zh ? '挑一张唱片' : 'PICK A RECORD'} <span>↗</span></a>
        </div>
      </div>
      <div className="hero-footer"><span>{zh ? '有些前奏，一响就认得' : 'YOU KNOW IT FROM THE FIRST NOTE.'}</span><span>{zh ? '往下看看' : 'KEEP GOING'} <span className="scroll-stroke" /></span></div>
    </section>
  );
}
