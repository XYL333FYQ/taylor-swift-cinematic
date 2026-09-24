import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { formatTime } from '@/utils/formatTime';

export type RepeatMode = 'off' | 'all' | 'one';

type MusicIconName = 'sequence' | 'shuffle' | 'previous' | 'play' | 'pause' | 'next' | 'repeat' | 'volume' | 'muted' | 'close';

export function MusicIcon({ name }: { name: MusicIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className={`music-icon music-icon-${name}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common}>
      {name === 'sequence' && <>
        <path d="M3 7h17m-3-3 3 3-3 3M3 17h17m-3-3 3 3-3 3" />
      </>}
      {name === 'shuffle' && <>
        <path d="M3 7h2.2c4.4 0 7.6 10 12 10H21" />
        <path d="m18 14 3 3-3 3M3 17h2.2c2.4 0 4.3-3.1 5.5-5.1S14 7 17 7h4" />
        <path d="m18 4 3 3-3 3" />
      </>}
      {name === 'previous' && <>
        <path d="M6 5v14" />
        <path d="m18 6-10 6 10 6V6Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'play' && <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />}
      {name === 'pause' && <>
        <path d="M8 6v12M16 6v12" strokeWidth="2.4" />
      </>}
      {name === 'next' && <>
        <path d="M18 5v14" />
        <path d="m6 6 10 6-10 6V6Z" fill="currentColor" stroke="none" />
      </>}
      {name === 'repeat' && <>
        <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15" />
        <path d="m7 22-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
      </>}
      {name === 'volume' && <>
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11" />
      </>}
      {name === 'muted' && <>
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        <path d="m17 9 5 6m0-6-5 6" />
      </>}
      {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  shuffle,
  repeatMode,
  volume,
  hasPrevious,
  hasNext,
  language,
  onCyclePlayMode,
  onPrevious,
  onTogglePlayback,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
}: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  volume: number;
  hasPrevious: boolean;
  hasNext: boolean;
  language: 'en' | 'zh';
  onCyclePlayMode: () => void;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => onSeek(Number(event.target.value));
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const volumeCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearVolumeTimer = () => {
    if (volumeCloseTimerRef.current) clearTimeout(volumeCloseTimerRef.current);
    volumeCloseTimerRef.current = null;
  };
  const closeVolume = () => {
    if (volumeControlRef.current?.contains(document.activeElement)) volumeButtonRef.current?.focus();
    setVolumeOpen(false);
  };
  const scheduleVolumeClose = (delay = 1500) => {
    clearVolumeTimer();
    volumeCloseTimerRef.current = setTimeout(closeVolume, delay);
  };
  useEffect(() => {
    if (!volumeOpen) return;
    const onOutsidePointer = (event: PointerEvent) => {
      if (!volumeControlRef.current?.contains(event.target as Node)) {
        clearVolumeTimer();
        setVolumeOpen(false);
      }
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    return () => document.removeEventListener('pointerdown', onOutsidePointer);
  }, [volumeOpen]);
  useEffect(() => () => clearVolumeTimer(), []);
  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(Number(event.target.value));
    scheduleVolumeClose();
  };
  const zh = language === 'zh';
  const mode = shuffle ? 'shuffle' : repeatMode === 'all' ? 'all' : repeatMode === 'one' ? 'one' : 'sequence';
  const modeLabel = zh
    ? { sequence: '顺序播放', shuffle: '随机播放', all: '全部循环', one: '单曲循环' }[mode]
    : { sequence: 'Play in order', shuffle: 'Shuffle', all: 'Repeat all', one: 'Repeat one' }[mode];
  const progressStyle = { '--music-progress': `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` } as CSSProperties;
  const volumeStyle = { '--music-progress': `${volume * 100}%` } as CSSProperties;

  return (
    <div className="music-playback-controls">
      <div className="music-progress-row">
        <span>{formatTime(currentTime)}</span>
        <input
          className="music-progress-slider"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          style={progressStyle}
          onChange={handleSeek}
          aria-label={zh ? '播放进度' : 'Playback progress'}
          disabled={!duration}
        />
        <span>{formatTime(duration)}</span>
      </div>

      <div className="music-transport-row">
        <div className="music-transport-cluster">
          <button type="button" className={`music-control-button music-mode-button ${mode !== 'sequence' ? 'is-active' : ''}`} aria-label={zh ? `播放模式：${modeLabel}，点击切换` : `Playback mode: ${modeLabel}. Click to change`} title={modeLabel} onClick={onCyclePlayMode}>
            <MusicIcon name={mode === 'shuffle' ? 'shuffle' : mode === 'sequence' ? 'sequence' : 'repeat'} />{mode === 'one' && <sup>1</sup>}
          </button>
          <button type="button" className="music-control-button" aria-label={zh ? '上一首' : 'Previous track'} onClick={onPrevious} disabled={!hasPrevious}><MusicIcon name="previous" /></button>
        </div>
        <button type="button" className={`music-play-toggle ${isPlaying ? 'is-playing' : ''}`} onClick={onTogglePlayback} aria-label={isPlaying ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play')}>
          <MusicIcon name={isPlaying ? 'pause' : 'play'} />
        </button>
        <div className="music-transport-cluster">
          <button type="button" className="music-control-button" aria-label={zh ? '下一首' : 'Next track'} onClick={onNext} disabled={!hasNext}><MusicIcon name="next" /></button>
          <div className="music-volume-control" ref={volumeControlRef}>
            <button
              ref={volumeButtonRef}
              type="button"
              className={`music-control-button music-volume-button ${volumeOpen ? 'is-active' : ''}`}
              aria-label={zh ? '调节音量' : 'Adjust volume'}
              aria-expanded={volumeOpen}
              aria-controls="music-volume-popover"
              onClick={() => {
                clearVolumeTimer();
                if (volumeOpen) setVolumeOpen(false);
                else { setVolumeOpen(true); scheduleVolumeClose(3000); }
              }}
            ><MusicIcon name={volume > 0 ? 'volume' : 'muted'} /></button>
            <div id="music-volume-popover" className={`music-volume-popover ${volumeOpen ? 'is-open' : ''}`} aria-hidden={!volumeOpen}>
              <button type="button" className="music-volume-mute" tabIndex={volumeOpen ? 0 : -1} aria-label={volume > 0 ? (zh ? '静音' : 'Mute') : (zh ? '取消静音' : 'Unmute')} onClick={() => { onToggleMute(); scheduleVolumeClose(); }}><MusicIcon name={volume > 0 ? 'volume' : 'muted'} /></button>
              <input type="range" min="0" max="1" step="0.01" value={volume} style={volumeStyle} onChange={handleVolume} onPointerDown={clearVolumeTimer} onPointerUp={() => scheduleVolumeClose()} tabIndex={volumeOpen ? 0 : -1} aria-label={zh ? '音量' : 'Volume'} />
              <span className="music-volume-number" aria-hidden="true">{Math.round(volume * 100)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
