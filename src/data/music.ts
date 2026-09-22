import { ERAS } from '@/data/eras';

export interface MusicTrack {
  id: string;
  title: string;
  file: string;
}

export interface MusicAlbum {
  id: string;
  name: {
    en: string;
    zh: string;
  };
  year: string;
  image: string;
  tracks: MusicTrack[];
}

/**
 * Local MP3 catalog.
 *
 * Add a track here after placing the file in public/audio/, for example:
 * debut: [{ id: 'debut-tim-mcgraw', title: 'Tim McGraw', file: 'audio/debut/tim-mcgraw.mp3' }]
 */
const TRACKS_BY_ALBUM: Partial<Record<string, MusicTrack[]>> = {};

export const MUSIC_LIBRARY: MusicAlbum[] = ERAS.map((era) => ({
  id: era.id,
  name: era.name,
  year: era.year,
  image: era.image,
  tracks: TRACKS_BY_ALBUM[era.id] ?? [],
}));
