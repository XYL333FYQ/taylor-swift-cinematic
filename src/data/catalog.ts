import { createContext, useContext } from 'react';

export interface LocalizedText { en: string; zh: string }

export interface Track {
  id: string;
  title: string;
  file: string;
  kind: 'full' | 'preview';
  lyrics?: string;
  lyricsUrl?: string;
  artist?: string;
  trackNumber?: number;
  discNumber?: number;
  artwork?: string;
}

/** The only runtime album shape. Display numbering and year come from catalog order/date. */
export interface Album {
  id: string;
  folder?: string;
  name: LocalizedText;
  releaseDate: string;
  year: string;
  number: string;
  artist?: string;
  genre: LocalizedText;
  description: LocalizedText;
  tagline: LocalizedText;
  quote: LocalizedText;
  color: string;
  colorAccent: string;
  artwork: { cover: string; presentation: string };
  watermark: string;
  archiveNote?: string;
  tracks: Track[];
}

export interface PlaylistEntry { albumId: string; trackId: string }

export interface Catalog { albums: Album[]; rotationPlaylist: PlaylistEntry[]; yearRange: string }
export const CatalogContext = createContext<Catalog | null>(null);

export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error('useCatalog must be used inside CatalogProvider');
  return catalog;
}
