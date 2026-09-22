import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { SiteCopy } from '@/data/i18n';

interface HeroIntroProps { copy: SiteCopy['hero']; onExploreClick: () => void }
export function HeroIntro({ copy, onExploreClick }: HeroIntroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-reveal', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1.5, stagger: 0.13, ease: 'power3.out' });
    }, sectionRef);
    return () => ctx.revert();
  }, []);
  const zh = /[\u4e00-\u9fff]/.test(copy.eyebrow);
  return (
    <section ref={sectionRef} className="editorial-hero" aria-label={copy.title}>
      <div className="hero-portrait" aria-hidden="true">
        <img src="./img/taylor/era-06.webp" alt="" fetchPriority="high" />
      </div>
      <div className="hero-shade" />
      <div className="hero-edition hero-reveal"><span>THE SONGS WE KEEP</span><span>2006—2025</span></div>
      <div className="hero-composition">
        <p className="hero-eyebrow hero-reveal"><span />{copy.eyebrow}</p>
        <h1 className="hero-title hero-reveal"><span>Taylor</span><span>Swift<span className="hero-star">✦</span></span></h1>
        <div className="hero-caption hero-reveal"><span className="hero-number">12</span><p>{copy.subtitle}</p></div>
        <div className="hero-actions hero-reveal">
          <button onClick={onExploreClick} className="editorial-button">{copy.enterButton}<span>↓</span></button>
          <a href="#archive">{zh ? '挑一张唱片' : 'PICK A RECORD'} <span>↗</span></a>
        </div>
      </div>
      <div className="hero-footer"><span>{zh ? '有些前奏，一响就认得' : 'YOU KNOW IT FROM THE FIRST NOTE.'}</span><span>{zh ? '往下看看' : 'KEEP GOING'} <span className="scroll-stroke" /></span></div>
    </section>
  );
}
