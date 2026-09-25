import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import gsap from 'gsap';
import type { Language } from '@/data/i18n';
import { useCatalog, type Album, type Track } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import { parseLyrics, type LyricLine } from '@/utils/lyrics';
import { useAudioFade } from '@/hooks/useAudioFade';
import { useVinylMotion } from '@/hooks/useVinylMotion';
import type { RepeatMode } from '@/components/music/PlaybackControls';

export interface MusicCommand {
  id: number;
  action: 'toggle' | 'play-rotation';
}

export interface MusicPlayerControllerProps {
  isOpen: boolean;
  language: Language;
  requestedAlbumId: string | null;
  musicCommand: MusicCommand | null;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
}

interface Selection {
  album: Album | null;
  track: Track | null;
}

interface PendingLoad {
  albumId: string;
  trackId: string;
  token: number;
  shouldPlay: boolean;
}

const lyricsCache = new Map<string, Promise<LyricLine[]>>();

function randomTrack(tracks: Track[], currentId: string | null) {
  if (tracks.length < 2) return tracks[0] ?? null;
  const choices = tracks.filter((track) => track.id !== currentId);
  return choices[Math.floor(Math.random() * choices.length)] ?? tracks[0] ?? null;
}

export function useMusicPlayerController({
  isOpen,
  language,
  requestedAlbumId,
  musicCommand,
  onPlayingChange,
  onClose,
}: MusicPlayerControllerProps) {
  const { albums, rotationPlaylist } = useCatalog();
  const audioRef = useRef<HTMLAudioElement>(null);
  const transitionTokenRef = useRef(0);
  const visualExitRef = useRef<(() => void) | null>(null);
  const playbackCommandRef = useRef(0);
  const pendingLoadRef = useRef<PendingLoad | null>(null);
  const playbackIntentRef = useRef(false);
  const languageRef = useRef(language);
  const isRotationRef = useRef(false);
  const rotationIndexRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatModeRef = useRef<RepeatMode>('off');
  const userVolumeRef = useRef(0.72);
  const lastAudibleVolumeRef = useRef(0.72);
  const fadePhaseRef = useRef<'in' | 'out' | null>(null);
  const selectionRef = useRef<Selection>({ album: null, track: null });
  const shuffleHistoryRef = useRef<Array<{ albumId: string; trackId: string }>>([]);
  const handleMusicCommandRef = useRef<(command: MusicCommand) => void>(() => {});

  const defaultAlbum = albums[0] ?? null;
  const [selectedAlbumId, setSelectedAlbumId] = useState(requestedAlbumId ?? defaultAlbum?.id ?? '');
  const initialAlbum = albums.find((album) => album.id === (requestedAlbumId ?? defaultAlbum?.id)) ?? defaultAlbum;
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(initialAlbum?.tracks[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRotation, setIsRotation] = useState(false);
  const [isDockMounted, setIsDockMounted] = useState(false);
  const [isDockShown, setIsDockShown] = useState(false);
  const [isChangingTrack, setIsChangingTrack] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [volume, setVolume] = useState(0.72);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? albums[0] ?? null,
    [albums, selectedAlbumId],
  );
  const currentTrack = useMemo(
    () => selectedAlbum?.tracks.find((track) => track.id === selectedTrackId) ?? null,
    [selectedAlbum, selectedTrackId],
  );
  useEffect(() => {
    const existing = albums.find((album) => album.id === selectedAlbumId);
    if (existing && (selectedTrackId
      ? existing.tracks.some((track) => track.id === selectedTrackId)
      : existing.tracks.length === 0)) return;
    const fallback = existing ?? albums[0];
    if (!fallback) return;
    audioRef.current?.pause();
    setIsPlaying(false);
    setSelectedAlbumId(fallback.id);
    setSelectedTrackId(fallback.tracks[0]?.id ?? null);
    selectionRef.current = { album: fallback, track: fallback.tracks[0] ?? null };
  }, [albums, selectedAlbumId, selectedTrackId]);
  const currentEra = selectedAlbum;
  const albumLabel = selectedAlbum?.name[language] ?? '';
  const [loadedLyrics, setLoadedLyrics] = useState<{ trackId: string; lines: LyricLine[] } | null>(null);
  const lyrics = loadedLyrics && loadedLyrics.trackId === currentTrack?.id ? loadedLyrics.lines : [];
  useEffect(() => {
    const track = currentTrack;
    if (!track) return;
    if (!track.lyricsUrl) return;
    const url = resolveMediaUrl(track.lyricsUrl);
    let request = lyricsCache.get(url);
    if (!request) {
      request = fetch(url).then((response) => {
        if (!response.ok) throw new Error(`Lyrics request failed: ${response.status}`);
        return response.text();
      }).then(parseLyrics);
      lyricsCache.set(url, request);
      void request.catch(() => lyricsCache.delete(url));
    }
    let active = true;
    void request.then((lines) => {
      if (active) setLoadedLyrics({ trackId: track.id, lines });
    }).catch(() => {
      if (active) setLoadedLyrics({ trackId: track.id, lines: parseLyrics(track.lyrics) });
    });
    return () => { active = false; };
  }, [currentTrack]);
  const embeddedLyrics = useMemo(() => parseLyrics(currentTrack?.lyrics), [currentTrack?.lyrics]);
  const { fadeTo } = useAudioFade(audioRef);
  const { vinylRef, burst: vinylBurst } = useVinylMotion(isPlaying);

  languageRef.current = language;
  shuffleRef.current = shuffle;
  repeatModeRef.current = repeatMode;
  userVolumeRef.current = volume;
  if (volume > 0) lastAudibleVolumeRef.current = volume;
  const pendingSelection = pendingLoadRef.current;
  if (!pendingSelection || (pendingSelection.albumId === selectedAlbum?.id && pendingSelection.trackId === currentTrack?.id)) {
    selectionRef.current = { album: selectedAlbum, track: currentTrack };
  }

  const markPlaybackError = useCallback(() => {
    const zh = languageRef.current === 'zh';
    setIsPlaying(false);
    playbackIntentRef.current = false;
    fadePhaseRef.current = null;
    setIsChangingTrack(false);
    setError(zh ? '这一首暂时放不出来，换一首试试。' : 'This one will not play. Try another.');
    if (audioRef.current) audioRef.current.volume = userVolumeRef.current;
    pendingLoadRef.current = null;
  }, []);

  const waitForVisualExit = useCallback(() => new Promise<void>((resolve) => {
    visualExitRef.current?.();
    const tween = gsap.delayedCall(0.2, () => {
      visualExitRef.current = null;
      resolve();
    });
    visualExitRef.current = () => { tween.kill(); resolve(); };
  }), []);

  const transitionToTrack = useCallback(async (
    album: Album,
    track: Track,
    shouldPlay: boolean,
    direction: 'next' | 'previous' | null,
    recordHistory = true,
  ) => {
    const previous = selectionRef.current;
    if (recordHistory && shuffleRef.current && previous.album && previous.track && previous.track.id !== track.id) {
      shuffleHistoryRef.current.push({ albumId: previous.album.id, trackId: previous.track.id });
    }

    const token = ++transitionTokenRef.current;
    playbackCommandRef.current += 1;
    playbackIntentRef.current = shouldPlay;
    selectionRef.current = { album, track };
    pendingLoadRef.current = { albumId: album.id, trackId: track.id, token, shouldPlay };
    setIsChangingTrack(true);
    setError(null);

    if (direction) vinylBurst(direction);

    const visualExit = waitForVisualExit();
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      fadePhaseRef.current = 'out';
      await Promise.all([fadeTo(0, 0.28), visualExit]);
      if (token !== transitionTokenRef.current) return;
      audio.pause();
    } else await visualExit;
    if (token !== transitionTokenRef.current) return;

    if (audio) audio.volume = 0;
    fadePhaseRef.current = null;
    setCurrentTime(0);
    setDuration(0);
    setSelectedAlbumId(album.id);
    setSelectedTrackId(track.id);
  }, [fadeTo, vinylBurst, waitForVisualExit]);

  const clearRotation = useCallback(() => {
    isRotationRef.current = false;
    setIsRotation(false);
  }, []);

  const playCurrentTrack = useCallback(async (restart = false) => {
    const audio = audioRef.current;
    const selection = selectionRef.current;
    if (!audio || !selection.track) return;

    playbackIntentRef.current = true;
    setError(null);
    const pending = pendingLoadRef.current;
    if (pending && pending.trackId === selection.track.id && audio.dataset.trackId !== pending.trackId) {
      pending.shouldPlay = true;
      return;
    }

    const command = ++playbackCommandRef.current;
    if (restart) {
      try { audio.currentTime = 0; } catch { /* metadata may still be loading */ }
      setCurrentTime(0);
    }

    const beginFadeIn = async () => {
      if (command !== playbackCommandRef.current || !playbackIntentRef.current) {
        if (!playbackIntentRef.current && !audio.paused) audio.pause();
        return;
      }
      fadePhaseRef.current = 'in';
      await fadeTo(userVolumeRef.current, 0.32);
      if (command !== playbackCommandRef.current || !playbackIntentRef.current) return;
      audio.volume = userVolumeRef.current;
      fadePhaseRef.current = null;
      setIsChangingTrack(false);
      if (pendingLoadRef.current?.trackId === selection.track?.id) pendingLoadRef.current = null;
    };

    if (!audio.paused && !audio.ended && !restart) {
      await beginFadeIn();
      return;
    }

    audio.volume = 0;
    try {
      await audio.play();
      await beginFadeIn();
    } catch {
      if (command === playbackCommandRef.current && playbackIntentRef.current) markPlaybackError();
    }
  }, [fadeTo, markPlaybackError]);

  const startRotation = useCallback((index: number, shouldPlay = true) => {
    const total = rotationPlaylist.length;
    if (!total) return;
    const normalizedIndex = (index + total) % total;
    const entry = rotationPlaylist[normalizedIndex];
    const album = albums.find((item) => item.id === entry?.albumId);
    const track = album?.tracks.find((item) => item.id === entry?.trackId);
    if (!album || !track) return;

    rotationIndexRef.current = normalizedIndex;
    isRotationRef.current = true;
    setIsRotation(true);
    if (
      selectionRef.current.album?.id === album.id &&
      selectionRef.current.track?.id === track.id &&
      audioRef.current?.dataset.trackId === track.id
    ) {
      if (shouldPlay) void playCurrentTrack();
      return;
    }
    void transitionToTrack(album, track, shouldPlay, null);
  }, [albums, rotationPlaylist, playCurrentTrack, transitionToTrack]);

  const advanceRotation = useCallback((step: number, shouldPlay: boolean) => {
    const total = rotationPlaylist.length;
    if (!total) return;
    startRotation(rotationIndexRef.current + step, shouldPlay);
  }, [rotationPlaylist.length, startRotation]);

  const pauseCurrentTrack = useCallback(async () => {
    playbackIntentRef.current = false;
    const pending = pendingLoadRef.current;
    const audio = audioRef.current;

    if (pending && audio?.dataset.trackId !== pending.trackId) {
      pending.shouldPlay = false;
      playbackCommandRef.current += 1;
      return;
    }

    if (pending) pending.shouldPlay = false;
    const command = ++playbackCommandRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.volume = userVolumeRef.current;
      fadePhaseRef.current = null;
      return;
    }

    fadePhaseRef.current = 'out';
    await fadeTo(0, 0.26);
    if (command !== playbackCommandRef.current || playbackIntentRef.current) return;
    audio.pause();
    audio.volume = userVolumeRef.current;
    fadePhaseRef.current = null;
  }, [fadeTo]);

  const togglePlayback = useCallback(() => {
    if (playbackIntentRef.current) void pauseCurrentTrack();
    else void playCurrentTrack();
  }, [pauseCurrentTrack, playCurrentTrack]);

  const toggleRotation = useCallback(() => {
    if (isRotationRef.current) clearRotation();
    else startRotation(0, true);
  }, [clearRotation, startRotation]);

  const selectAlbum = useCallback((album: Album) => {
    clearRotation();
    const firstTrack = album.tracks[0];
    if (firstTrack) void transitionToTrack(album, firstTrack, false, null);
    else {
      audioRef.current?.pause();
      setIsPlaying(false);
      selectionRef.current = { album, track: null };
      setSelectedAlbumId(album.id);
      setSelectedTrackId(null);
    }
  }, [clearRotation, transitionToTrack]);

  const selectTrack = useCallback((track: Track, source: 'click' | 'scroll') => {
    const album = selectionRef.current.album;
    if (!album) return;
    if (selectionRef.current.track?.id === track.id) {
      if (source === 'click') togglePlayback();
      return;
    }
    clearRotation();
    const currentIndex = album.tracks.findIndex((item) => item.id === selectionRef.current.track?.id);
    const nextIndex = album.tracks.findIndex((item) => item.id === track.id);
    const direction = nextIndex >= currentIndex ? 'next' : 'previous';
    void transitionToTrack(album, track, source === 'click' || playbackIntentRef.current, direction);
  }, [clearRotation, togglePlayback, transitionToTrack]);

  const chooseRandom = useCallback((album: Album, currentId: string | null) => randomTrack(album.tracks, currentId), []);

  const selectRelativeTrack = useCallback((step: 1 | -1, fromEnded = false) => {
    if (isRotationRef.current) {
      advanceRotation(step, fromEnded || playbackIntentRef.current);
      return;
    }

    const { album, track } = selectionRef.current;
    if (!album || !track) return;

    if (step < 0 && shuffleRef.current && shuffleHistoryRef.current.length) {
      const previous = shuffleHistoryRef.current.pop();
      const previousAlbum = albums.find((item) => item.id === previous?.albumId);
      const previousTrack = previousAlbum?.tracks.find((item) => item.id === previous?.trackId);
      if (previousAlbum && previousTrack) {
        void transitionToTrack(previousAlbum, previousTrack, playbackIntentRef.current || fromEnded, 'previous', false);
        return;
      }
    }

    let target: Track | null = null;
    let wrappedToFirstTrack = false;
    if (shuffleRef.current && album.tracks.length > 1) {
      target = chooseRandom(album, track.id);
    } else {
      const currentIndex = album.tracks.findIndex((item) => item.id === track.id);
      let nextIndex = currentIndex + step;
      if (repeatModeRef.current === 'all') {
        nextIndex = (nextIndex + album.tracks.length) % album.tracks.length;
      } else if (step > 0 && nextIndex >= album.tracks.length && album.tracks.length > 1) {
        nextIndex = 0;
        wrappedToFirstTrack = true;
      } else if (nextIndex < 0 || nextIndex >= album.tracks.length) {
        if (fromEnded) {
          playbackIntentRef.current = false;
          setIsPlaying(false);
          setIsChangingTrack(false);
        }
        return;
      }
      target = album.tracks[nextIndex] ?? null;
    }

    if (!target) return;
    const currentIndex = album.tracks.findIndex((item) => item.id === track.id);
    const targetIndex = album.tracks.findIndex((item) => item.id === target?.id);
    const direction = wrappedToFirstTrack ? 'next' : targetIndex >= currentIndex ? 'next' : 'previous';
    void transitionToTrack(album, target, fromEnded || playbackIntentRef.current, direction);
  }, [advanceRotation, albums, chooseRandom, transitionToTrack]);

  const handlePrevious = useCallback(() => selectRelativeTrack(-1), [selectRelativeTrack]);
  const handleNext = useCallback(() => selectRelativeTrack(1), [selectRelativeTrack]);

  const handleEnded = useCallback(() => {
    if (!playbackIntentRef.current) return;
    if (repeatModeRef.current === 'one') {
      void playCurrentTrack(true);
      return;
    }
    if (isRotationRef.current && repeatModeRef.current === 'off' && rotationIndexRef.current >= rotationPlaylist.length - 1) {
      playbackIntentRef.current = false;
      setIsPlaying(false);
      setIsChangingTrack(false);
      return;
    }
    selectRelativeTrack(1, true);
  }, [playCurrentTrack, rotationPlaylist, selectRelativeTrack]);

  const cyclePlayMode = useCallback(() => {
    const nextShuffle = !shuffleRef.current && repeatModeRef.current === 'off';
    const nextRepeat: RepeatMode = shuffleRef.current ? 'all'
      : repeatModeRef.current === 'all' ? 'one' : 'off';
    shuffleRef.current = nextShuffle;
    repeatModeRef.current = nextRepeat;
    setShuffle(nextShuffle);
    setRepeatMode(nextRepeat);
    if (nextShuffle && isRotationRef.current) clearRotation();
    if (!nextShuffle) shuffleHistoryRef.current = [];
  }, [clearRotation]);

  const setUserVolume = useCallback((nextValue: number) => {
    const next = Math.max(0, Math.min(nextValue, 1));
    userVolumeRef.current = next;
    if (next > 0) lastAudibleVolumeRef.current = next;
    setVolume(next);
    const audio = audioRef.current;
    if (!audio || !playbackIntentRef.current || fadePhaseRef.current === 'out') return;
    if (fadePhaseRef.current === 'in') {
      void fadeTo(next, 0.16).then(() => {
        if (playbackIntentRef.current && fadePhaseRef.current === 'in') fadePhaseRef.current = null;
      });
    } else if (!audio.paused) {
      audio.volume = next;
    }
  }, [fadeTo]);

  const toggleMute = useCallback(() => {
    if (userVolumeRef.current > 0) {
      lastAudibleVolumeRef.current = userVolumeRef.current;
      setUserVolume(0);
    } else {
      setUserVolume(lastAudibleVolumeRef.current || 0.72);
    }
  }, [setUserVolume]);

  const handleSeek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime) || !Number.isFinite(audio.duration)) return;
    const target = Math.max(0, Math.min(nextTime, audio.duration));
    audio.currentTime = target;
    setCurrentTime(target);
  }, []);

  const handleMusicCommand = useCallback((command: MusicCommand) => {
    if (command.action === 'play-rotation') {
      startRotation(0, true);
      return;
    }
    const selection = selectionRef.current;
    if (playbackIntentRef.current) {
      void pauseCurrentTrack();
    } else if (isRotationRef.current && selection.track) {
      void playCurrentTrack();
    } else {
      startRotation(0, true);
    }
  }, [pauseCurrentTrack, playCurrentTrack, startRotation]);

  handleMusicCommandRef.current = handleMusicCommand;
  useEffect(() => {
    if (!musicCommand) return;
    handleMusicCommandRef.current(musicCommand);
  }, [musicCommand]);

  useEffect(() => {
    const album = albums.find((item) => item.id === requestedAlbumId);
    if (!album || selectionRef.current.album?.id === album.id) return;
    clearRotation();
    const firstTrack = album.tracks[0];
    if (firstTrack) void transitionToTrack(album, firstTrack, false, null);
    else {
      audioRef.current?.pause();
      setIsPlaying(false);
      selectionRef.current = { album, track: null };
      setSelectedAlbumId(album.id);
      setSelectedTrackId(null);
    }
  }, [albums, clearRotation, requestedAlbumId, transitionToTrack]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      setIsDockMounted(true);
      const frame = requestAnimationFrame(() => setIsDockShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setIsDockShown(false);
    const timer = window.setTimeout(() => setIsDockMounted(false), 460);
    return () => window.clearTimeout(timer);
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    const track = currentTrack;
    if (!audio) return;
    if (!track || !selectedAlbum) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      pendingLoadRef.current = null;
      setDuration(0);
      setCurrentTime(0);
      setIsChangingTrack(false);
      return;
    }

    const request = pendingLoadRef.current?.albumId === selectedAlbum.id && pendingLoadRef.current.trackId === track.id
      ? pendingLoadRef.current
      : null;
    const token = request?.token ?? transitionTokenRef.current;
    const source = resolveMediaUrl(track.file);
    let active = true;

    audio.pause();
    audio.volume = 0;
    audio.dataset.trackId = track.id;
    setCurrentTime(0);
    setDuration(0);

    const onLoadedMetadata = () => {
      if (!active || audio.dataset.trackId !== track.id || token !== transitionTokenRef.current) return;
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (!request?.shouldPlay) {
        audio.volume = userVolumeRef.current;
        fadePhaseRef.current = null;
        setIsChangingTrack(false);
        if (pendingLoadRef.current?.token === token) pendingLoadRef.current = null;
      }
    };
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.src = source;
    audio.load();

    if (request?.shouldPlay && playbackIntentRef.current) {
      const command = playbackCommandRef.current;
      fadePhaseRef.current = 'in';
      void audio.play().then(async () => {
        if (!active || token !== transitionTokenRef.current || command !== playbackCommandRef.current || !playbackIntentRef.current) {
          if (audio.dataset.trackId === track.id && !playbackIntentRef.current) audio.pause();
          return;
        }
        await fadeTo(userVolumeRef.current, 0.34);
        if (!active || token !== transitionTokenRef.current || command !== playbackCommandRef.current || !playbackIntentRef.current) return;
        audio.volume = userVolumeRef.current;
        fadePhaseRef.current = null;
        setIsChangingTrack(false);
        if (pendingLoadRef.current?.token === token) pendingLoadRef.current = null;
      }).catch(() => {
        if (active && token === transitionTokenRef.current && command === playbackCommandRef.current && playbackIntentRef.current) markPlaybackError();
      });
    } else if (!request) {
      audio.volume = userVolumeRef.current;
      setIsChangingTrack(false);
    }

    return () => {
      active = false;
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [currentTrack, selectedAlbum, fadeTo, markPlaybackError]);

  useEffect(() => () => {
    transitionTokenRef.current += 1;
    visualExitRef.current?.();
    visualExitRef.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
  }, []);

  const onAudioError = () => {
    const audio = audioRef.current;
    if (!currentTrack || (audio?.dataset.trackId && audio.dataset.trackId !== currentTrack.id)) return;
    markPlaybackError();
  };

  const onAudioReady = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || audio.dataset.trackId !== currentTrack.id) return;
    if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    // Cached media can become ready before the transition effect's listener observes it.
    if (audio.paused && !playbackIntentRef.current) {
      audio.volume = userVolumeRef.current;
      fadePhaseRef.current = null;
      setIsChangingTrack(false);
      if (pendingLoadRef.current?.trackId === currentTrack.id) pendingLoadRef.current = null;
    }
  };

  const selectedIndex = selectedAlbum?.tracks.findIndex((track) => track.id === currentTrack?.id) ?? -1;
  const hasPrevious = isRotationRef.current || shuffle || repeatMode === 'all' || selectedIndex > 0;
  const canWrapSequentially = repeatMode === 'off' && selectedIndex === (selectedAlbum?.tracks.length ?? 0) - 1
    && (selectedAlbum?.tracks.length ?? 0) > 1;
  const hasNext = isRotationRef.current || shuffle || repeatMode === 'all' || canWrapSequentially
    || (selectedAlbum ? selectedIndex < selectedAlbum.tracks.length - 1 : false);

  const dockSeek = (event: ChangeEvent<HTMLInputElement>) => handleSeek(Number(event.target.value));


  const handleAudioPlay = useCallback((audio: HTMLAudioElement) => {
    if (!playbackIntentRef.current) {
      audio.pause();
      return;
    }
    setIsPlaying(true);
  }, []);
  const handleAudioPause = useCallback((audio: HTMLAudioElement) => {
    setIsPlaying(!audio.paused);
  }, []);
  const handleAudioTimeUpdate = useCallback((audio: HTMLAudioElement) => {
    if (audio.dataset.trackId === currentTrack?.id) setCurrentTime(audio.currentTime);
  }, [currentTrack?.id]);

  return {
    audioRef, selectedAlbum, currentTrack, currentEra, albumLabel,
    lyrics: currentTrack?.lyricsUrl ? lyrics : embeddedLyrics,
    isPlaying, currentTime, duration, error, isRotation, isDockMounted,
    isDockShown, isChangingTrack, shuffle, repeatMode, volume,
    selectedIndex, hasPrevious, hasNext, dockSeek,
    vinylRef, selectTrack, cyclePlayMode, handlePrevious, togglePlayback,
    handleNext, handleSeek, setUserVolume, toggleMute, selectAlbum,
    toggleRotation, handleEnded, onAudioError, onAudioReady,
    handleAudioPlay, handleAudioPause, handleAudioTimeUpdate,
  };
}
