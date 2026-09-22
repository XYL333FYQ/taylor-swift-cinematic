import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { copyData, type Language } from '@/data/i18n';
import { Navigation } from '@/components/Navigation';
import { MusicPlayer } from '@/components/MusicPlayer';
import { FilmGrain } from '@/components/FilmGrain';
import { Loader } from '@/components/loader';
import { EraIndex } from '@/sections/EraIndex';
import { HeroIntro } from '@/sections/HeroIntro';
import { CylinderExperience } from '@/sections/CylinderExperience';
import { CylinderPortal } from '@/sections/CylinderPortal';
import { ErasCorridor } from '@/sections/ErasCorridor';
import { SpotlightEra } from '@/sections/SpotlightEra';
import { FinaleOutro } from '@/sections/FinaleOutro';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isMusicOpen, setIsMusicOpen] = useState(false);
  const [requestedAlbumId, setRequestedAlbumId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('ts-language');
      if (saved === 'zh' || saved === 'en') return saved;
    }
    return 'en';
  });

  const copy = copyData[language];
  const handleLoaded = useCallback(() => setIsLoading(false), []);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = copy.pageTitle;
    window.localStorage.setItem('ts-language', language);
  }, [copy.pageTitle, language]);

  const handleToggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'zh' : 'en'));
  };

  const handleOpenMusic = useCallback((albumId?: string) => {
    if (albumId) setRequestedAlbumId(albumId);
    setIsMusicOpen(true);
  }, []);

  const handleRestart = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExploreClick = () => {
    document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Loader isLoading={isLoading} />
      <FilmGrain />

      <Navigation
        language={language}
        onToggleLanguage={handleToggleLanguage}
        onOpenMusic={handleOpenMusic}
        brandText={copy.brand}
      />

      <main id="main-content" role="main" className="relative w-full bg-[#050505]">
        {/* Act I: Hero Intro */}
        <HeroIntro copy={copy.hero} onExploreClick={handleExploreClick} />

        {/* Act II: OGL 3D Cylinder Orbit */}
        <CylinderExperience
          copy={copy.cylinder}
          onLoaded={handleLoaded}
        />

        {/* Act III: Seamless Dive Portal */}
        <CylinderPortal copy={copy.portal} />

        {/* Act IV: Pinned Horizontal Eras Corridor */}
        <ErasCorridor copy={copy.erasCorridor} language={language} onPlayAlbum={handleOpenMusic} />

        {/* Act V: Featured Era Spotlight */}
        <SpotlightEra copy={copy.spotlight} />

        {/* Act VI: Finale Epilogue */}
        <EraIndex language={language} onPlayAlbum={handleOpenMusic} />
        <FinaleOutro copy={copy.finale} onRestart={handleRestart} />
      </main>
      <MusicPlayer
        isOpen={isMusicOpen}
        language={language}
        requestedAlbumId={requestedAlbumId}
        onOpen={() => setIsMusicOpen(true)}
        onClose={() => setIsMusicOpen(false)}
      />
    </>
  );
}
