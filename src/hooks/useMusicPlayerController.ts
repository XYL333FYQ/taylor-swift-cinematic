import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import gsap from 'gsap';
import type { Language } from '@/data/i18n';
import { useCatalog, type Album, type Track } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import { isAudioFormatSupported } from '@/utils/audioFormat';
import { parseLyrics, type LyricLine } from '@/utils/lyrics';
import { useAudioFade } from '@/hooks/useAudioFade';
import { useVinylMotion } from '@/hooks/useVinylMotion';
import type { RepeatMode } from '@/components/music/PlaybackControls';

export interface MusicCommand {
  id: number;
  action: 'toggle' | 'play-rotation';
}

/** One-shot navigation intent: later audio state changes must not replay it. */
export interface AlbumRequest {
  id: number;
  albumId: string;
}

export interface MusicPlayerControllerProps {
  isOpen: boolean;
  language: Language;
  albumRequest: AlbumRequest | null;
  musicCommand: MusicCommand | null;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackError?: (message: string) => void;
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
  albumRequest,
  musicCommand,
  onPlayingChange,
  onPlaybackError,
  onClose,
}: MusicPlayerControllerProps) {
  const { albums, rotationPlaylist } = useCatalog();
  const audioRef = useRef<HTMLAudioElement>(null);
  const transitionTokenRef = useRef(0);
  const visualExitRef = useRef<(() => void) | null>(null);
  const playbackCommandRef = useRef(0);
  const handledMusicCommandRef = useRef(0);
  const handledAlbumRequestRef = useRef(0);
  const pendingLoadRef = useRef<PendingLoad | null>(null);
  const playbackIntentRef = useRef(false);
  const languageRef = useRef(language);
  const isOpenRef = useRef(isOpen);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const isRotationRef = useRef(false);
  const rotationIndexRef = useRef(0);
  const shuffleRef = useRef(false);
  const repeatModeRef = useRef<RepeatMode>('off');
  const userVolumeRef = useRef(0.72);
  const lastAudibleVolumeRef = useRef(0.72);
  const fadePhaseRef = useRef<'in' | 'out' | null>(null);
  const selectionRef = useRef<Selection>({ album: null, track: null });
  const shuffleHistoryRef = useRef<Array<{ albumId: string; trackId: string }>>([]);

  const defaultAlbum = albums[0] ?? null;
  const [selectedAlbumId, setSelectedAlbumId] = useState(albumRequest?.albumId ?? defaultAlbum?.id ?? '');
  const initialAlbum = albums.find((album) => album.id === (albumRequest?.albumId ?? defaultAlbum?.id)) ?? defaultAlbum;
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
  isOpenRef.current = isOpen;
  onPlaybackErrorRef.current = onPlaybackError;
  shuffleRef.current = shuffle;
  repeatModeRef.current = repeatMode;
  userVolumeRef.current = volume;
  if (volume > 0) lastAudibleVolumeRef.current = volume;
  const pendingSelection = pendingLoadRef.current;
  if (!pendingSelection || (pendingSelection.albumId === selectedAlbum?.id && pendingSelection.trackId === currentTrack?.id)) {
    selectionRef.current = { album: selectedAlbum, track: currentTrack };
  }

  const markPlaybackError = useCallback((cause?: unknown) => {
    const zh = languageRef.current === 'zh';
    const wasRequested = playbackIntentRef.current;
    setIsPlaying(false);
    playbackIntentRef.current = false;
    fadePhaseRef.current = null;
    setIsChangingTrack(false);
    const policyBlocked = cause instanceof DOMException && cause.name === 'NotAllowedError';
    const unsupported = cause instanceof Error && (cause.message === 'UNSUPPORTED_AUDIO_FORMAT' || cause.name === 'NotSupportedError');
    const networkFailure = audioRef.current?.error?.code === 2;
    const sourceFailure = audioRef.current?.error?.code === 4;
    const message = unsupported
      ? (zh ? '这份音频在当前浏览器中无法播放，可以尝试 MP3 或 AAC 版本。' : 'This audio could not play in this browser. Try an MP3 or AAC version.')
      : policyBlocked
      ? (zh ? '浏览器阻止了播放，请再次点击播放按钮，或检查网站的自动播放权限。' : 'Playback was blocked. Press Play again or check this site’s autoplay permission.')
      : networkFailure
      ? (zh ? '音频加载失败，请检查网络后再次点击播放。' : 'Audio could not load. Check your connection and press Play again.')
      : sourceFailure
      ? (zh ? '音频无法播放，请检查网络，或尝试 MP3、AAC 版本。' : 'Audio could not play. Check the connection or try an MP3 or AAC version.')
      : (zh ? '这一首暂时放不出来，换一首试试。' : 'This one will not play. Try another.');
    setError(message);
    if (!isOpenRef.current && wasRequested) onPlaybackErrorRef.current?.(message);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.volume = userVolumeRef.current;
    }
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
    fromUserGesture = false,
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

    const audio = audioRef.current;
    // Safari's media permission is attached to the originating user gesture.
    // Selecting a song or pressing the rotation button must not defer play()
    // behind GSAP delays, state effects, or awaited fades.
    if (fromUserGesture && shouldPlay && audio) {
      const command = playbackCommandRef.current;
      audio.pause();
      if (!isAudioFormatSupported(audio, resolveMediaUrl(track.file))) {
        setSelectedAlbumId(album.id);
        setSelectedTrackId(track.id);
        markPlaybackError(new Error('UNSUPPORTED_AUDIO_FORMAT'));
        return;
      }
      audio.volume = 0;
      audio.dataset.albumId = album.id;
      audio.dataset.trackId = track.id;
      audio.src = resolveMediaUrl(track.file);
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      setSelectedAlbumId(album.id);
      setSelectedTrackId(track.id);
      fadePhaseRef.current = 'in';
      // Invoke synchronously, before yielding to React effects or GSAP.
      void audio.play().then(async () => {
        if (command !== playbackCommandRef.current || token !== transitionTokenRef.current || !playbackIntentRef.current) return;
        await fadeTo(userVolumeRef.current, 0.34);
        if (command !== playbackCommandRef.current || token !== transitionTokenRef.current || !playbackIntentRef.current) return;
        audio.volume = userVolumeRef.current;
        fadePhaseRef.current = null;
        setIsChangingTrack(false);
        if (pendingLoadRef.current?.token === token) pendingLoadRef.current = null;
      }).catch((cause: unknown) => {
        if (command === playbackCommandRef.current && token === transitionTokenRef.current && playbackIntentRef.current) markPlaybackError(cause);
      });
      return;
    }

    const visualExit = waitForVisualExit();
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
  }, [fadeTo, markPlaybackError, vinylBurst, waitForVisualExit]);

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
    if (pending && (audio.dataset.trackId !== pending.trackId || audio.dataset.albumId !== pending.albumId)) {
      if (selection.album) void transitionToTrack(selection.album, selection.track, true, null, false, true);
      return;
    }

    if (audio.dataset.trackId !== selection.track.id || audio.dataset.albumId !== selection.album?.id) {
      if (selection.album) void transitionToTrack(selection.album, selection.track, true, null, false, true);
      return;
    }

    const command = ++playbackCommandRef.current;
    const retryingFailedSource = Boolean(audio.error);
    if (retryingFailedSource) {
      // A failed media element can report paused=false yet never emit "playing".
      // Reload the current source so a later click can retry a network failure.
      audio.pause();
      audio.src = resolveMediaUrl(selection.track.file);
      audio.load();
    }
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

    if (!audio.paused && !audio.ended && !restart && !retryingFailedSource) {
      await beginFadeIn();
      return;
    }

    audio.volume = 0;
    try {
      await audio.play();
      await beginFadeIn();
    } catch (cause) {
      if (command === playbackCommandRef.current && playbackIntentRef.current) markPlaybackError(cause);
    }
  }, [fadeTo, markPlaybackError, transitionToTrack]);

  const startRotation = useCallback((index: number, shouldPlay = true, fromUserGesture = false) => {
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
    void transitionToTrack(album, track, shouldPlay, null, true, fromUserGesture);
  }, [albums, rotationPlaylist, playCurrentTrack, transitionToTrack]);

  const advanceRotation = useCallback((step: number, shouldPlay: boolean, fromUserGesture = false) => {
    const total = rotationPlaylist.length;
    if (!total) return;
    startRotation(rotationIndexRef.current + step, shouldPlay, fromUserGesture);
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
    else startRotation(0, true, true);
  }, [clearRotation, startRotation]);

  const selectAlbum = useCallback((album: Album) => {
    clearRotation();
    const firstTrack = album.tracks[0];
    if (selectionRef.current.album?.id === album.id && selectionRef.current.track?.id === firstTrack?.id) return;
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
    // A clicked track retains its gesture when its source is changed. A wheel
    // event is not universally considered a media activation by browsers.
    void transitionToTrack(album, track, source === 'click' || playbackIntentRef.current, direction, true, source === 'click');
  }, [clearRotation, togglePlayback, transitionToTrack]);

  const chooseRandom = useCallback((album: Album, currentId: string | null) => randomTrack(album.tracks, currentId), []);

  const selectRelativeTrack = useCallback((step: 1 | -1, fromEnded = false, fromUserGesture = false) => {
    if (isRotationRef.current) {
      advanceRotation(step, fromEnded || playbackIntentRef.current, fromUserGesture);
      return;
    }

    const { album, track } = selectionRef.current;
    if (!album || !track) return;

    if (step < 0 && shuffleRef.current && shuffleHistoryRef.current.length) {
      const previous = shuffleHistoryRef.current.pop();
      const previousAlbum = albums.find((item) => item.id === previous?.albumId);
      const previousTrack = previousAlbum?.tracks.find((item) => item.id === previous?.trackId);
      if (previousAlbum && previousTrack) {
        void transitionToTrack(previousAlbum, previousTrack, playbackIntentRef.current || fromEnded, 'previous', false, fromUserGesture);
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
    void transitionToTrack(album, target, fromEnded || playbackIntentRef.current, direction, true, fromUserGesture);
  }, [advanceRotation, albums, chooseRandom, transitionToTrack]);

  const handlePrevious = useCallback(() => selectRelativeTrack(-1, false, true), [selectRelativeTrack]);
  const handleNext = useCallback(() => selectRelativeTrack(1, false, true), [selectRelativeTrack]);

  const handleEnded = useCallback((audio: HTMLAudioElement) => {
    // A queued ended event from a previous source must never move the carousel.
    if (!audio.ended || audio.dataset.trackId !== selectionRef.current.track?.id
      || audio.dataset.albumId !== selectionRef.current.album?.id || pendingLoadRef.current) return;
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

  const executeMusicCommand = useCallback((command: MusicCommand, fromUserGesture: boolean) => {
    if (command.id <= handledMusicCommandRef.current) return true;
    if (command.action === 'play-rotation') {
      if (!rotationPlaylist.length) return false;
      handledMusicCommandRef.current = command.id;
      startRotation(0, true, fromUserGesture);
      return true;
    }
    if (playbackIntentRef.current) {
      handledMusicCommandRef.current = command.id;
      void pauseCurrentTrack();
      return true;
    }
    if (isRotationRef.current && selectionRef.current.track) {
      handledMusicCommandRef.current = command.id;
      void playCurrentTrack();
      return true;
    }
    if (!rotationPlaylist.length) return false;
    handledMusicCommandRef.current = command.id;
    startRotation(0, true, fromUserGesture);
    return true;
  }, [pauseCurrentTrack, playCurrentTrack, rotationPlaylist.length, startRotation]);

  const handleGestureCommand = useCallback((command: MusicCommand) => executeMusicCommand(command, true), [executeMusicCommand]);

  useEffect(() => {
    if (!musicCommand) return;
    executeMusicCommand(musicCommand, false);
  }, [executeMusicCommand, musicCommand]);

  useEffect(() => {
    if (!albumRequest || albumRequest.id <= handledAlbumRequestRef.current) return;
    const album = albums.find((item) => item.id === albumRequest.albumId);
    if (!album) return; // Catalog might still be loading: retry when it arrives.
    handledAlbumRequestRef.current = albumRequest.id;
    if (selectionRef.current.album?.id === album.id) return;
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
  }, [albumRequest, albums, clearRotation, transitionToTrack]);

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

    // A click may already have loaded/started the new audio synchronously.
    // Reassigning src here would abort play() (especially in Safari).
    if (audio.dataset.albumId === selectedAlbum.id && audio.dataset.trackId === track.id
      && audio.getAttribute('src') === source) return;

    if (!isAudioFormatSupported(audio, source)) {
      audio.pause();
      markPlaybackError(new Error('UNSUPPORTED_AUDIO_FORMAT'));
      return;
    }

    audio.pause();
    audio.volume = 0;
    audio.dataset.albumId = selectedAlbum.id;
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
      }).catch((cause: unknown) => {
        if (active && token === transitionTokenRef.current && command === playbackCommandRef.current && playbackIntentRef.current) markPlaybackError(cause);
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


  const handleAudioPlaying = useCallback((audio: HTMLAudioElement) => {
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
    handleAudioPlaying, handleAudioPause, handleAudioTimeUpdate,
    handleGestureCommand,
  };
}
