import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';

export function useAudioFade(audioRef: { current: HTMLAudioElement | null }) {
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const fadeTo = useCallback((volume: number, duration: number) => {
    const audio = audioRef.current;
    if (!audio) return Promise.resolve();

    tweenRef.current?.kill();
    const target = Math.max(0, Math.min(volume, 1));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) {
      audio.volume = target;
      tweenRef.current = null;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      tweenRef.current = gsap.to(audio, {
        volume: target,
        duration,
        ease: 'power1.inOut',
        overwrite: true,
        onComplete: () => {
          tweenRef.current = null;
          resolve();
        },
        onInterrupt: resolve,
      });
    });
  }, [audioRef]);

  const cancelFade = useCallback(() => {
    tweenRef.current?.kill();
    tweenRef.current = null;
  }, []);

  useEffect(() => () => {
    tweenRef.current?.kill();
    tweenRef.current = null;
  }, []);

  return { fadeTo, cancelFade };
}
