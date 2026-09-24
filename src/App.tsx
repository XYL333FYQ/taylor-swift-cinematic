import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { copyData, type Language } from '@/data/i18n';
import { Navigation } from '@/components/Navigation';
import { MusicPlayer } from '@/components/MusicPlayer';
import type { MusicCommand } from '@/hooks/useMusicPlayerController';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  const [musicCommand, setMusicCommand] = useState<MusicCommand | null>(null);
  const musicCommandIdRef = useRef(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
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

  const issueMusicCommand = useCallback((action: MusicCommand['action']) => {
    musicCommandIdRef.current += 1;
    setMusicCommand({ id: musicCommandIdRef.current, action });
  }, []);

  /** 主界面入口：从头开始轮换播放已发现的专辑。 */
  const handlePlayRotation = useCallback(() => issueMusicCommand('play-rotation'), [issueMusicCommand]);

  /** 顶栏开关：播放中暂停，暂停时继续当前曲目或开始轮换。 */
  const handleToggleMusic = useCallback(() => issueMusicCommand('toggle'), [issueMusicCommand]);

  const handleMusicPlayingChange = useCallback((playing: boolean) => {
    setIsMusicPlaying(playing);
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
        isMusicPlaying={isMusicPlaying}
        onToggleMusic={handleToggleMusic}
        brandText={copy.brand}
      />

      <main id="main-content" role="main" className="relative w-full bg-[#050505]">
        {/* Act I: Hero Intro */}
        <ErrorBoundary label="hero">
          <HeroIntro
            copy={copy.hero}
            language={language}
            onExploreClick={handleExploreClick}
            onPlayRotation={handlePlayRotation}
          />
        </ErrorBoundary>

        {/* Act II: OGL 3D Cylinder Orbit */}
        <ErrorBoundary label="cylinder">
          <CylinderExperience copy={copy.cylinder} onLoaded={handleLoaded} />
        </ErrorBoundary>

        {/* Act III: Seamless Dive Portal */}
        <ErrorBoundary label="portal">
          <CylinderPortal copy={copy.portal} />
        </ErrorBoundary>

        {/* Act IV: Pinned Horizontal Eras Corridor */}
        <ErrorBoundary label="corridor">
          <ErasCorridor copy={copy.erasCorridor} language={language} onPlayAlbum={handleOpenMusic} />
        </ErrorBoundary>

        {/* Act V: Featured Era Spotlight */}
        <ErrorBoundary label="spotlight">
          <SpotlightEra copy={copy.spotlight} />
        </ErrorBoundary>

        {/* Act VI: Finale Epilogue */}
        <ErrorBoundary label="index">
          <EraIndex language={language} onPlayAlbum={handleOpenMusic} />
        </ErrorBoundary>
        <ErrorBoundary label="finale">
          <FinaleOutro copy={copy.finale} onRestart={handleRestart} />
        </ErrorBoundary>
      </main>
      <MusicPlayer
        isOpen={isMusicOpen}
        language={language}
        requestedAlbumId={requestedAlbumId}
        musicCommand={musicCommand}
        onPlayingChange={handleMusicPlayingChange}
        onOpen={() => setIsMusicOpen(true)}
        onClose={() => setIsMusicOpen(false)}
      />
    </>
  );
}
