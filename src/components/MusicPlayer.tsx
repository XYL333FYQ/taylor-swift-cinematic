import type { CSSProperties } from 'react';
import type { Language } from '@/data/i18n';
import { MUSIC_LIBRARY } from '@/data/music';
import { EraCarousel } from '@/components/music/EraCarousel';
import { PlayerStage } from '@/components/music/PlayerStage';
import { MusicIcon } from '@/components/music/PlaybackControls';
import { useMusicPlayerController, type MusicCommand } from '@/hooks/useMusicPlayerController';
import { formatTime } from '@/utils/formatTime';

interface MusicPlayerProps {
  isOpen: boolean;
  language: Language;
  requestedAlbumId: string | null;
  musicCommand: MusicCommand | null;
  onPlayingChange: (playing: boolean) => void;
  onOpen: () => void;
  onClose: () => void;
}

export function MusicPlayer({
  isOpen,
  language,
  requestedAlbumId,
  musicCommand,
  onPlayingChange,
  onOpen,
  onClose,
}: MusicPlayerProps) {
  const {
    audioRef,
    selectedAlbum,
    currentTrack,
    currentEra,
    albumLabel,
    lyrics,
    isPlaying,
    currentTime,
    duration,
    error,
    isRotation,
    isDockMounted,
    isDockShown,
    isChangingTrack,
    shuffle,
    repeatMode,
    volume,
    hasPrevious,
    hasNext,
    dockSeek,
    vinylRef,
    selectTrack,
    cyclePlayMode,
    handlePrevious,
    togglePlayback,
    handleNext,
    handleSeek,
    setUserVolume,
    toggleMute,
    selectAlbum,
    toggleRotation,
    handleEnded,
    onAudioError,
    onAudioReady,
    handleAudioPlay,
    handleAudioPause,
    handleAudioTimeUpdate,
  } = useMusicPlayerController({
    isOpen,
    language,
    requestedAlbumId,
    musicCommand,
    onPlayingChange,
    onClose,
  });

  return (
    <>
      {isOpen && selectedAlbum && currentEra && (
        <>
          <button type="button" className="music-backdrop" aria-label={language === 'zh' ? '关闭音乐播放器' : 'Close music player'} onClick={onClose} />
          <section className="music-drawer" style={{ '--music-era-glow': currentEra.colorAccent } as CSSProperties} role="dialog" aria-modal="true" aria-label={language === 'zh' ? '音乐播放器' : 'Music player'}>
            <header className="music-player-topbar">
              <div>
                <p className="section-kicker">{language === 'zh' ? '歌与时代' : 'THE SONGS WE KEEP'}</p>
                <p className="music-player-heading">{language === 'zh' ? `${MUSIC_LIBRARY.length} 个时代，一首一首听过去。` : `${MUSIC_LIBRARY.length} eras, one song at a time.`}</p>
              </div>
              <button type="button" className="music-close-button" onClick={onClose} aria-label={language === 'zh' ? '关闭播放器' : 'Close player'}><MusicIcon name="close" /></button>
            </header>

            {currentTrack ? (
              <PlayerStage
                era={currentEra}
                album={selectedAlbum}
                track={currentTrack}
                tracks={selectedAlbum.tracks}
                language={language}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                isChangingTrack={isChangingTrack}
                shuffle={shuffle}
                repeatMode={repeatMode}
                volume={volume}
                lyrics={lyrics}
                vinylRef={vinylRef}
                error={error}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
                onSelectTrack={selectTrack}
                onCyclePlayMode={cyclePlayMode}
                onPrevious={handlePrevious}
                onTogglePlayback={togglePlayback}
                onNext={handleNext}
                onSeek={handleSeek}
                onVolumeChange={setUserVolume}
                onToggleMute={toggleMute}
              />
            ) : (
              <main className="music-empty-player">{language === 'zh' ? '这个时代暂时没有可播放的曲目。' : 'There are no playable tracks in this era yet.'}</main>
            )}

            <EraCarousel
              albums={MUSIC_LIBRARY}
              selectedAlbumId={selectedAlbum.id}
              language={language}
              isRotation={isRotation}
              onSelectAlbum={selectAlbum}
              onToggleRotation={toggleRotation}
            />
          </section>
        </>
      )}

      {!isOpen && isDockMounted && currentTrack && selectedAlbum && (
        <div className={`music-dock ${isDockShown ? 'is-visible' : ''}`} aria-label={language === 'zh' ? '当前播放' : 'Now playing'}>
          <button
            type="button"
            className="music-dock-cover"
            onClick={onOpen}
            aria-label={language === 'zh' ? '打开播放器' : 'Open player'}
            title={language === 'zh' ? '打开播放器' : 'Open player'}
          >
            <img src={selectedAlbum.image} alt="" />
            <span className="music-dock-cover-veil" aria-hidden="true">♫</span>
          </button>
          <div className="music-dock-body">
            <div className="music-dock-row">
              <div className="music-dock-meta">
                <strong>{currentTrack.title}</strong>
                <small>{isRotation ? (language === 'zh' ? '时代轮换' : 'ERA ROTATION') : albumLabel}</small>
              </div>
              <div className="music-dock-controls">
                <button type="button" onClick={handlePrevious} aria-label={language === 'zh' ? '上一首' : 'Previous track'} disabled={!hasPrevious}><MusicIcon name="previous" /></button>
                <button type="button" className="music-play-button" onClick={togglePlayback} aria-label={isPlaying ? (language === 'zh' ? '暂停' : 'Pause') : (language === 'zh' ? '播放' : 'Play')}><MusicIcon name={isPlaying ? 'pause' : 'play'} /></button>
                <button type="button" onClick={handleNext} aria-label={language === 'zh' ? '下一首' : 'Next track'} disabled={!hasNext}><MusicIcon name="next" /></button>
              </div>
            </div>
            <div className="music-dock-progress">
              <span>{formatTime(currentTime)}</span>
              <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={dockSeek} aria-label={language === 'zh' ? '播放进度' : 'Playback progress'} disabled={!duration} />
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        className="music-audio-element"
        preload="metadata"
        onPlay={(event) => handleAudioPlay(event.currentTarget)}
        onPause={(event) => handleAudioPause(event.currentTarget)}
        onTimeUpdate={(event) => handleAudioTimeUpdate(event.currentTarget)}
        onLoadedMetadata={onAudioReady}
        onCanPlay={onAudioReady}
        onEnded={handleEnded}
        onError={onAudioError}
      />
    </>
  );
}
