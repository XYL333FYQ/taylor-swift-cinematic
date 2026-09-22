import { useEffect, useState } from 'react';

interface LoaderProps {
  isLoading: boolean;
}

export function Loader({ isLoading }: LoaderProps) {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setShouldRender(false), 900);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] transition-opacity duration-700 ease-out pointer-events-none ${
        isLoading ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        <span className="font-cinzel text-sm tracking-[0.4em] uppercase text-white/80">
          TAYLOR SWIFT
        </span>
        <div className="w-32 h-[1px] bg-white/15 overflow-hidden relative">
          <div className="absolute inset-0 bg-white/90 animate-[loader-drift_1.6s_ease-in-out_infinite]" />
        </div>
        <span className="font-sans text-[10px] tracking-[0.24em] text-white/40 uppercase">
          JUST A MOMENT
        </span>
      </div>
    </div>
  );
}
