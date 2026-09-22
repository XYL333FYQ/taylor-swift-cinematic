import { useState, useEffect } from 'react';
import type { Language } from '@/data/i18n';
import { ambientSound } from '@/lib/audio/ambient';

interface NavigationProps {
  language: Language;
  onToggleLanguage: () => void;
  onOpenMusic: () => void;
  brandText: string;
}

export function Navigation({ language, onToggleLanguage, onOpenMusic, brandText }: NavigationProps) {
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleToggleAudio = () => {
    const nextState = ambientSound.toggle();
    setIsAudioActive(nextState);
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 md:py-6 transition-all duration-500 pointer-events-none ${
        hasScrolled ? 'bg-black/40 backdrop-blur-md border-b border-white/5' : 'bg-transparent'
      }`}
    >
      {/* Brand logo */}
      <div className="pointer-events-auto flex items-center gap-3">
        <button
          type="button"
          onClick={handleScrollToTop}
          className="group flex items-center gap-2.5 text-left border-none bg-transparent cursor-pointer p-0 text-white"
          aria-label="Scroll to top"
        >
          <span className="w-2 h-2 rounded-full bg-white/80 group-hover:scale-125 transition-transform duration-300" />
          <span className="font-cinzel text-xs md:text-sm font-semibold tracking-[0.28em] uppercase text-white/90 group-hover:text-white transition-colors">
            {brandText}
          </span>
        </button>
      </div>

      <nav className="chapter-nav" aria-label={language === 'zh' ? '章节导航' : 'Chapters'}>
        <button type="button" onClick={onOpenMusic}>{language === 'zh' ? '音乐' : 'The songs'}</button>
        <a href="#archive">{language === 'zh' ? '唱片架' : 'The records'}</a>
      </nav>
      {/* Right controls: Sound + Language */}
      <div className="pointer-events-auto flex items-center gap-3 md:gap-4">
        <button
          type="button"
          className="mobile-music-trigger md:hidden"
          onClick={onOpenMusic}
          aria-label={language === 'zh' ? '打开音乐播放器' : 'Open music player'}
        >
          ♫
        </button>
        {/* Audio Toggle */}
        <button
          type="button"
          onClick={handleToggleAudio}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] tracking-[0.14em] font-sans transition-all duration-300 border cursor-pointer ${
            isAudioActive
              ? 'border-amber-400/60 bg-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
              : 'border-white/20 bg-white/5 text-white/70 hover:text-white hover:border-white/40'
          }`}
          aria-pressed={isAudioActive}
          aria-label={language === 'zh' ? '切换环境声' : 'Toggle ambient sound'}
          title={language === 'zh' ? '合成环境声景' : 'Generative ambient soundscape'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              isAudioActive ? 'bg-amber-400 animate-pulse' : 'bg-white/40'
            }`}
          />
          <span className="hidden sm:inline">SOUND</span>
          <span>{isAudioActive ? 'ON' : 'OFF'}</span>
        </button>

        {/* Language Toggle */}
        <button
          type="button"
          onClick={onToggleLanguage}
          className="px-3.5 py-1.5 rounded-full text-[11px] tracking-[0.14em] font-sans transition-all duration-300 border border-white/20 bg-white/5 text-white/80 hover:text-white hover:border-white/40 cursor-pointer"
          aria-label={language === 'en' ? '切换为中文' : 'Switch to English'}
        >
          {language === 'en' ? '中文' : 'EN'}
        </button>
      </div>
    </header>
  );
}
