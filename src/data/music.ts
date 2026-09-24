import { ERAS } from '@/data/eras';
import { GENERATED_ALBUMS, GENERATED_TRACKS } from '@/data/music.generated';

export interface MusicTrack {
  id: string;
  title: string;
  file: string;
  /** 'full' = 你自己放入的完整音频；'preview' = 官方约 30 秒试听片段。 */
  kind?: 'full' | 'preview';
  /** Embedded synchronized lyrics, when there is no LRC sidecar. */
  lyrics?: string;
  /** LRC sidecar loaded only when this track is selected. */
  lyricsUrl?: string;
  artist?: string;
  trackNumber?: number;
  discNumber?: number;
  artwork?: string;
}

export interface MusicAlbum {
  id: string;
  name: {
    en: string;
    zh: string;
  };
  year: string;
  artist?: string;
  genre: {
    en: string;
    zh: string;
  };
  image: string;
  tracks: MusicTrack[];
}

const generatedAlbumsById = new Map(GENERATED_ALBUMS.map((album) => [album.id, album]));

export const MUSIC_LIBRARY: MusicAlbum[] = ERAS.map((era) => {
  const album = generatedAlbumsById.get(era.id);
  return {
    id: era.id,
    name: era.name,
    year: era.year,
    artist: era.artist,
    genre: era.stats.genre,
    image: album?.artworkLevel === 'album' ? album.image : era.image,
    tracks: GENERATED_TRACKS[era.id] ?? [],
  };
});

export interface PlaylistEntry {
  albumId: string;
  trackId: string;
}

/**
 * 主界面轮换歌单：按"轮次"跨专辑轮转 —— 先每个时代各放第一首，再各放第二首，
 * 依此类推。新增的专辑目录会自动参与轮换。
 */
function buildRotationPlaylist(library: MusicAlbum[]): PlaylistEntry[] {
  const entries: PlaylistEntry[] = [];
  const longest = library.reduce((max, album) => Math.max(max, album.tracks.length), 0);

  for (let round = 0; round < longest; round += 1) {
    for (const album of library) {
      const track = album.tracks[round];
      if (track) entries.push({ albumId: album.id, trackId: track.id });
    }
  }

  return entries;
}

export const ROTATION_PLAYLIST: PlaylistEntry[] = buildRotationPlaylist(MUSIC_LIBRARY);
