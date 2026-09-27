import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { copyData, type Language } from '@/data/i18n';
import { Navigation } from '@/components/Navigation';
import { MusicPlayer } from '@/components/MusicPlayer';
import type { AlbumRequest, MusicCommand } from '@/hooks/useMusicPlayerController';
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
  // A navigation request is an event, not the player's permanent selected album.
  const [albumRequest, setAlbumRequest] = useState<AlbumRequest | null>(null);
  const albumRequestIdRef = useRef(0);
  const [musicCommand, setMusicCommand] = useState<MusicCommand | null>(null);
  const musicCommandIdRef = useRef(0);
  const musicCommandHandlerRef = useRef<((command: MusicCommand) => boolean) | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('ts-language');
      if (saved === 'zh' || saved === 'en') return saved;
    }
    return 'en';
  });

  const copy = copyData[language];

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    void document.fonts.ready.then(() => {
      if (!disposed) frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

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
    // Navigation passes a click event if its handler is wired directly.
    // Only a real album ID may update the selection request.
    if (typeof albumId === 'string' && albumId) setAlbumRequest({ id: ++albumRequestIdRef.current, albumId });
    setIsMusicOpen(true);
  }, []);

  const issueMusicCommand = useCallback((action: MusicCommand['action']) => {
    musicCommandIdRef.current += 1;
    const command = { id: musicCommandIdRef.current, action };
    // Safari may reject audible media started later in a React effect. Keep
    // deliberate play commands in the originating click's activation stack.
    if (!musicCommandHandlerRef.current?.(command)) setMusicCommand(command);
  }, []);

  const registerMusicCommandHandler = useCallback((handler: ((command: MusicCommand) => boolean) | null) => {
    musicCommandHandlerRef.current = handler;
  }, []);

  /** 主界面入口：从头开始轮换播放已发现的专辑。 */
  const handlePlayRotation = useCallback(() => issueMusicCommand('play-rotation'), [issueMusicCommand]);

  /** 顶栏开关：播放中暂停，暂停时继续当前曲目或开始轮换。 */
  const handleToggleMusic = useCallback(() => issueMusicCommand('toggle'), [issueMusicCommand]);

  const handleMusicPlayingChange = useCallback((playing: boolean) => {
    setIsMusicPlaying(playing);
    if (playing) setPlaybackNotice(null);
  }, []);

  const handlePlaybackError = useCallback((message: string) => setPlaybackNotice(message), []);

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
        albumRequest={albumRequest}
        musicCommand={musicCommand}
        onCommandHandlerChange={registerMusicCommandHandler}
        onPlayingChange={handleMusicPlayingChange}
        onPlaybackError={handlePlaybackError}
        onOpen={() => setIsMusicOpen(true)}
        onClose={() => setIsMusicOpen(false)}
      />
      {playbackNotice && !isMusicOpen && (
        <div className="music-playback-notice" role="alert">
          <span>{playbackNotice}</span>
          <button type="button" aria-label={language === 'zh' ? '关闭提示' : 'Dismiss'} onClick={() => setPlaybackNotice(null)}>×</button>
        </div>
      )}
    </>
  );
}
