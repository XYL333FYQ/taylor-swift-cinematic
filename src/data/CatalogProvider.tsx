import { useEffect, useState, type ReactNode } from 'react';
import { CatalogContext, type Album, type Catalog, type PlaylistEntry } from './catalog';
import { catalogUrl } from './media';

function rotationPlaylist(albums: Album[]): PlaylistEntry[] {
  const entries: PlaylistEntry[] = [];
  const longest = albums.reduce((max, album) => Math.max(max, album.tracks.length), 0);
  for (let round = 0; round < longest; round += 1) {
    for (const album of albums) {
      const track = album.tracks[round];
      if (track) entries.push({ albumId: album.id, trackId: track.id });
    }
  }
  return entries;
}

function normalize(raw: { albums: (Omit<Album, 'year' | 'number' | 'watermark'> & { watermark?: string })[] }): Catalog {
  const albums = raw.albums.map((album, index) => {
    const year = album.releaseDate.slice(0, 4);
    return {
      ...album,
      year,
      number: String(index + 1).padStart(2, '0'),
      watermark: album.watermark || `${album.name.en.toUpperCase()}${year ? ` · ${year}` : ''}`,
    };
  });
  const years = albums.map((album) => Number(album.year)).filter((year) => Number.isFinite(year) && year > 0);
  return {
    albums,
    rotationPlaylist: rotationPlaylist(albums),
    yearRange: years.length ? `${Math.min(...years)}—${Math.max(...years)}` : '',
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(catalogUrl(), { cache: 'no-store' });
        if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
        const data = await response.json();
        if (active) { setCatalog(normalize(data)); setError(false); }
      } catch (cause) {
        console.error(cause);
        if (active) setError(true);
      }
    };
    void load();
    if (import.meta.hot) import.meta.hot.on('catalog-updated', load);
    return () => {
      active = false;
      if (import.meta.hot) import.meta.hot.off('catalog-updated', load);
    };
  }, []);
  if (!catalog) return <div className="catalog-loading" role="status">{error ? 'Album catalog unavailable.' : 'Loading albums…'}</div>;
  if (catalog.albums.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 py-16 text-white" role="status">
        <section className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl sm:p-12">
          <p className="mb-4 text-xs tracking-[0.24em] text-amber-200/70">THE CINEMATIC ERAS ARCHIVE</p>
          <h1 className="font-serif text-3xl sm:text-4xl">The archive is waiting for its first album.</h1>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-white/70">
            本地开发时，把你有权使用的音频放入 audio/专辑目录/，开发服务器会自动扫描。生产环境则需要让 VITE_CATALOG_URL 指向已发布的非空 Catalog。
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">
            During local development, add audio you are allowed to use under audio/album-folder/. The dev server scans it automatically. In production, set VITE_CATALOG_URL to a published, non-empty catalog.
          </p>
          <p className="mt-8 text-xs text-white/45">入门指南 / Start here: docs/ADD_ALBUMS.md</p>
        </section>
      </main>
    );
  }
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}
