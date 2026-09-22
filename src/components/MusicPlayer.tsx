import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Language } from '@/data/i18n';
import { MUSIC_LIBRARY, type MusicAlbum } from '@/data/music';

interface MusicPlayerProps {
  isOpen: boolean;
  language: Language;
  requestedAlbumId: string | null;
  onOpen: () => void;
  onClose: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function resolveAudioUrl(file: string) {
  if (/^(https?:|blob:|data:)/i.test(file)) return file;
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${file.replace(/^\/+/, '')}`;
}

export function MusicPlayer({ isOpen, language, requestedAlbumId, onOpen, onClose }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingPlayTrackRef = useRef<string | null>(null);
  const defaultAlbumId = MUSIC_LIBRARY[0]?.id ?? '';
  const [selectedAlbumId, setSelectedAlbumId] = useState(requestedAlbumId ?? defaultAlbumId);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zh = language === 'zh';

  const selectedAlbum = useMemo<MusicAlbum | undefined>(
    () => MUSIC_LIBRARY.find((album) => album.id === selectedAlbumId) ?? MUSIC_LIBRARY[0],
    [selectedAlbumId],
  );

  const currentTrack = useMemo(
    () => selectedAlbum?.tracks.find((track) => track.id === selectedTrackId),
    [selectedAlbum, selectedTrackId],
  );

  useEffect(() => {
    if (requestedAlbumId) setSelectedAlbumId(requestedAlbumId);
  }, [requestedAlbumId]);

  useEffect(() => {
    const firstTrack = selectedAlbum?.tracks[0];
    setSelectedTrackId(firstTrack?.id ?? null);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setIsPlaying(false);
    pendingPlayTrackRef.current = null;
  }, [selectedAlbum]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);

    if (!currentTrack) {
      audio.removeAttribute('src');
      audio.load();
      pendingPlayTrackRef.current = null;
      return;
    }

    audio.src = resolveAudioUrl(currentTrack.file);
    audio.load();

    if (pendingPlayTrackRef.current === currentTrack.id) {
      pendingPlayTrackRef.current = null;
      void audio.play().catch(() => {
        setError(zh ? '无法自动播放，请点击播放按钮。' : 'Autoplay was blocked. Press play to start.');
      });
    }
  }, [currentTrack, zh]);

  const handleTogglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    setError(null);
    if (audio.paused) {
      void audio.play().catch(() => {
        setError(zh ? '音频无法播放，请检查 MP3 文件路径。' : 'This audio could not play. Check the MP3 path.');
      });
    } else {
      audio.pause();
    }
  };

  const handleSelectTrack = (trackId: string) => {
    if (trackId === selectedTrackId) {
      handleTogglePlayback();
      return;
    }
    pendingPlayTrackRef.current = trackId;
    setSelectedTrackId(trackId);
  };

  const handleSelectAlbum = (album: MusicAlbum) => {
    setSelectedAlbumId(album.id);
  };

  const handlePreviousTrack = () => {
    if (!selectedAlbum || !currentTrack) return;
    const currentIndex = selectedAlbum.tracks.findIndex((track) => track.id === currentTrack.id);
    const previousTrack = selectedAlbum.tracks[currentIndex - 1];
    if (previousTrack) {
      pendingPlayTrackRef.current = previousTrack.id;
      setSelectedTrackId(previousTrack.id);
    }
  };

  const handleNextTrack = () => {
    if (!selectedAlbum || !currentTrack) return;
    const currentIndex = selectedAlbum.tracks.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = selectedAlbum.tracks[currentIndex + 1];
    if (nextTrack) {
      pendingPlayTrackRef.current = nextTrack.id;
      setSelectedTrackId(nextTrack.id);
    }
  };

  const handleEnded = () => {
    if (!selectedAlbum || !currentTrack) return;
    const currentIndex = selectedAlbum.tracks.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = selectedAlbum.tracks[currentIndex + 1];
    if (nextTrack) {
      pendingPlayTrackRef.current = nextTrack.id;
      setSelectedTrackId(nextTrack.id);
    } else {
      setIsPlaying(false);
    }
  };

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const hasCurrentTrack = Boolean(selectedAlbum && currentTrack);
  const albumLabel = selectedAlbum ? selectedAlbum.name[language] : '';

  return (
    <>
      {isOpen && (
        <>
          <button type="button" className="music-backdrop" aria-label={zh ? '关闭音乐面板' : 'Close music panel'} onClick={onClose} />
          <aside className="music-drawer" aria-label={zh ? '音乐播放器' : 'Music player'}>
            <div className="music-drawer-header">
              <div>
                <p className="section-kicker">{zh ? '本地音乐' : 'LOCAL MUSIC'}</p>
                <h2>{zh ? '把喜欢的歌放进来。' : 'Bring your favorite songs in.'}</h2>
              </div>
              <button type="button" className="music-close-button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>
                ×
              </button>
            </div>

            <div className="music-library-layout">
              <div className="music-album-list" role="listbox" aria-label={zh ? '选择专辑' : 'Choose an album'}>
                {MUSIC_LIBRARY.map((album) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={album.id === selectedAlbum?.id}
                    className={`music-album-option ${album.id === selectedAlbum?.id ? 'is-selected' : ''}`}
                    key={album.id}
                    onClick={() => handleSelectAlbum(album)}
                  >
                    <img src={album.image} alt="" />
                    <span>
                      <strong>{album.name[language]}</strong>
                      <small>{album.year}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="music-queue">
                {selectedAlbum && (
                  <div className="music-record-heading">
                    <div
                      className={`vinyl-record ${isPlaying ? 'is-spinning' : ''}`}
                      role="img"
                      aria-label={zh ? `${albumLabel} 黑胶唱片` : `${albumLabel} vinyl record`}
                    >
                      <div className="vinyl-record-label">
                        <img src={selectedAlbum.image} alt="" />
                      </div>
                      <span className="vinyl-record-hole" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="section-kicker">{selectedAlbum.year} · {zh ? '专辑' : 'RECORD'}</p>
                      <h3>{albumLabel}</h3>
                      <p>{selectedAlbum.tracks.length ? `${selectedAlbum.tracks.length} ${zh ? '首已登记 · 33⅓ RPM' : 'tracks ready · 33⅓ RPM'}` : (zh ? '等待放入 MP3' : 'Waiting for MP3 files')}</p>
                    </div>
                  </div>
                )}

                {selectedAlbum?.tracks.length ? (
                  <ol className="music-track-list">
                    {selectedAlbum.tracks.map((track, index) => (
                      <li key={track.id}>
                        <button
                          type="button"
                          className={track.id === currentTrack?.id ? 'is-current' : ''}
                          onClick={() => handleSelectTrack(track.id)}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <strong>{track.title}</strong>
                          <span aria-hidden="true">{track.id === currentTrack?.id && isPlaying ? 'Ⅱ' : '▶'}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="music-empty-state">
                    <p>{zh ? '这个时代还没有添加 MP3。' : 'No MP3 has been added for this era yet.'}</p>
                    <small>{zh ? '将文件放进 public/audio，再到 src/data/music.ts 登记歌曲。' : 'Place a file in public/audio, then register it in src/data/music.ts.'}</small>
                  </div>
                )}

                {error && <p className="music-error" role="alert">{error}</p>}
              </div>
            </div>
          </aside>
        </>
      )}

      {hasCurrentTrack && (
        <div className="music-dock" aria-label={zh ? '当前播放' : 'Now playing'}>
          <div className="music-dock-info">
            <span className="music-dock-label">{zh ? '正在播放' : 'NOW PLAYING'}</span>
            <strong>{currentTrack?.title}</strong>
            <small>{albumLabel}</small>
          </div>
          <div className="music-dock-controls">
            <button type="button" onClick={handlePreviousTrack} aria-label={zh ? '上一首' : 'Previous track'}>◀◀</button>
            <button type="button" className="music-play-button" onClick={handleTogglePlayback} aria-label={isPlaying ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play')}>
              {isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <button type="button" onClick={handleNextTrack} aria-label={zh ? '下一首' : 'Next track'}>▶▶</button>
          </div>
          <div className="music-progress">
            <span>{formatTime(currentTime)}</span>
            <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={handleSeek} aria-label={zh ? '播放进度' : 'Playback progress'} disabled={!duration} />
            <span>{formatTime(duration)}</span>
          </div>
          <button type="button" className="music-dock-open" onClick={isOpen ? onClose : onOpen} aria-label={isOpen ? (zh ? '关闭播放器' : 'Close player') : (zh ? '打开播放器' : 'Open player')}>
            {isOpen ? '×' : '♫'}
          </button>
        </div>
      )}

      <audio
        ref={audioRef}
        className="music-audio-element"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={handleEnded}
        onError={() => {
          setIsPlaying(false);
          if (currentTrack) setError(zh ? `找不到 ${currentTrack.file}` : `Could not load ${currentTrack.file}`);
        }}
      />
    </>
  );
}
