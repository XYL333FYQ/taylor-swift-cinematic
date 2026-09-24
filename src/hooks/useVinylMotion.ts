import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';

type BurstDirection = 'next' | 'previous';

export function useVinylMotion(isPlaying: boolean) {
  const vinylRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef({ angle: 0, velocity: 0 });
  const tickerRef = useRef<((time: number, deltaTime: number) => void) | null>(null);

  const stopTicker = useCallback(() => {
    const ticker = tickerRef.current;
    if (ticker) gsap.ticker.remove(ticker);
    tickerRef.current = null;
  }, []);

  const ensureTicker = useCallback(() => {
    if (tickerRef.current) return;
    tickerRef.current = (_time, deltaTime) => {
      const node = vinylRef.current;
      if (!node) return;
      const motion = motionRef.current;
      motion.angle += motion.velocity * (deltaTime / 1000);
      gsap.set(node, { rotation: motion.angle, force3D: true });
    };
    gsap.ticker.add(tickerRef.current);
  }, []);

  useEffect(() => {
    const node = vinylRef.current;
    const motion = motionRef.current;
    if (!node) return;

    gsap.killTweensOf(motion);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motion.velocity = 0;
      gsap.set(node, { rotation: motion.angle });
      stopTicker();
      return;
    }

    if (isPlaying) {
      ensureTicker();
      gsap.to(motion, { velocity: 72, duration: 0.56, ease: 'power2.out' });
    } else if (motion.velocity > 0) {
      ensureTicker();
      gsap.to(motion, {
        velocity: 0,
        duration: 0.68,
        ease: 'power2.out',
        onComplete: stopTicker,
      });
    } else {
      motion.velocity = 0;
      stopTicker();
    }
  }, [ensureTicker, isPlaying, stopTicker]);

  const burst = useCallback((direction: BurstDirection) => {
    const node = vinylRef.current;
    const motion = motionRef.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    ensureTicker();
    gsap.killTweensOf(motion);
    const kick = direction === 'next' ? 190 : -105;
    motion.velocity = kick;
    gsap.to(motion, {
      velocity: isPlaying ? 72 : 0,
      delay: 0.14,
      duration: 0.48,
      ease: 'power2.out',
      onComplete: () => {
        if (!isPlaying) stopTicker();
      },
    });
  }, [ensureTicker, isPlaying, stopTicker]);

  useEffect(() => () => {
    gsap.killTweensOf(motionRef.current);
    stopTicker();
  }, [stopTicker]);

  return { vinylRef, burst };
}
