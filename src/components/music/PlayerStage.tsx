import { useState, type CSSProperties, type RefObject } from 'react';
import type { EraData } from '@/data/eras';
import { ERAS } from '@/data/eras';
import type { Language } from '@/data/i18n';
import type { MusicAlbum, MusicTrack } from '@/data/music';
import type { LyricLine } from '@/utils/lyrics';
import { LyricsCylinder } from './LyricsCylinder';
import { PlaybackControls, type RepeatMode } from './PlaybackControls';
import { TrackCylinder } from './TrackCylinder';
import { VinylRecord } from './VinylRecord';

export function PlayerStage({
  era,
  album,
  track,
  tracks,
  language,
  currentTime,
  duration,
  isPlaying,
  isChangingTrack,
  shuffle,
  repeatMode,
  volume,
  lyrics,
  vinylRef,
  error,
  hasPrevious,
  hasNext,
  onSelectTrack,
  onCyclePlayMode,
  onPrevious,
  onTogglePlayback,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
}: {
  era: EraData;
  album: MusicAlbum;
  track: MusicTrack;
  tracks: MusicTrack[];
  language: Language;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isChangingTrack: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  volume: number;
  lyrics: LyricLine[];
  vinylRef: RefObject<HTMLDivElement | null>;
  error: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onSelectTrack: (track: MusicTrack, source: 'click' | 'scroll') => void;
  onCyclePlayMode: () => void;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const zh = language === 'zh';
  const text = era.description[language];
  const [mobileView, setMobileView] = useState<'player' | 'tracks' | 'lyrics'>('player');

  return (
    <main className="music-main-grid" data-mobile-view={mobileView} style={{ '--music-era-glow': era.colorAccent } as CSSProperties}>
      <div className="music-stage-ambience" aria-hidden="true" style={{ '--music-ambience-image': `url("${album.image}")` } as CSSProperties} />
      <nav className="music-mobile-nav" aria-label={zh ? '播放器内容' : 'Player sections'}>
        {([
          ['player', zh ? '播放' : 'PLAYER'],
          ['tracks', zh ? '曲目' : 'TRACKS'],
          ['lyrics', zh ? '歌词' : 'LYRICS'],
        ] as const).map(([view, label]) => (
          <button type="button" key={view} className={mobileView === view ? 'is-active' : ''} aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{label}</button>
        ))}
      </nav>
      <section className={`music-side-panel music-left-panel ${isChangingTrack ? 'is-changing' : ''}`} aria-label={zh ? '时代与曲目' : 'Era and tracks'}>
        <div className="music-side-intro music-era-intro" key={era.id}>
          <p className="section-kicker">{zh ? '时代档案' : 'ERA ARCHIVE'} · {era.number} / {ERAS.length}</p>
          <div className="music-era-title-lockup"><span>{era.number}</span>{era.year && <><i aria-hidden="true">/</i><small>{era.year}</small></>}</div>
          <h2>{era.name[language]}</h2>
          {text && <p className="music-era-description">{text}</p>}
        </div>
        <TrackCylinder tracks={tracks} currentTrackId={track.id} isPlaying={isPlaying} language={language} onSelectTrack={onSelectTrack} />
      </section>

      <section className="music-center-column" aria-label={zh ? '当前播放' : 'Now playing'}>
        <div className={`music-cover-composition ${isChangingTrack ? 'is-changing' : ''}`} data-track-id={track.id}>
          <div className="music-cover-artwork">
            <img src={album.image} alt={`${album.name[language]} album cover`} />
            <span className="music-cover-veil" aria-hidden="true" />
          </div>
          <VinylRecord cover={album.image} label={zh ? `${album.name[language]} 黑胶唱片` : `${album.name[language]} vinyl record`} vinylRef={vinylRef} />
        </div>

        <div className={`music-center-track-info ${isChangingTrack ? 'is-changing' : ''}`} aria-live="polite">
          <h1>{track.title}</h1>
          <p>{album.artist ?? track.artist ?? 'Taylor Swift'} · {album.name[language]}</p>
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          shuffle={shuffle}
          repeatMode={repeatMode}
          volume={volume}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          language={language}
          onCyclePlayMode={onCyclePlayMode}
          onPrevious={onPrevious}
          onTogglePlayback={onTogglePlayback}
          onNext={onNext}
          onSeek={onSeek}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
        />
        {error && <p className="music-error" role="alert">{error}</p>}
      </section>

      <section className={`music-side-panel music-right-panel ${isChangingTrack ? 'is-changing' : ''}`} aria-label={zh ? '歌词' : 'Lyrics'}>
        <LyricsCylinder lines={lyrics} currentTime={currentTime} language={language} onSeek={onSeek} />
        {!lyrics.length && (
          <div className="music-lyrics-empty" data-lyrics-empty="true" role="status" aria-label={zh ? '暂无歌词' : 'No lyrics available'}>
            <span className="music-lyrics-empty-line" aria-hidden="true" />
            <p>{zh ? '把这一段留给音乐。' : 'Let the music speak.'}</p>
          </div>
        )}
      </section>
    </main>
  );
}
