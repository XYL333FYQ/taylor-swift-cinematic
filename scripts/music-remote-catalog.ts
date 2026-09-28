import type { CatalogAlbum, CatalogTrack } from '../plugins/audio-library.ts';

export type PublishedAlbum = Omit<CatalogAlbum, 'folder'>;
export interface PublishedCatalog { albums: PublishedAlbum[] }

const safeId = (value: unknown): value is string => typeof value === 'string'
  && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const localized = (value: unknown): boolean => record(value)
  && typeof value.en === 'string' && typeof value.zh === 'string';

export function parseRemoteCatalog(text: string): PublishedCatalog {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('R2 catalog.json is not valid JSON; no changes were made.'); }
  if (!record(parsed) || !Array.isArray(parsed.albums)) {
    throw new Error('R2 catalog.json has no valid albums array; no changes were made.');
  }
  const albumIds = new Set<string>();
  for (const album of parsed.albums) {
    if (!record(album) || !safeId(album.id) || albumIds.has(album.id)
      || !localized(album.name) || typeof album.releaseDate !== 'string'
      || !localized(album.genre) || !localized(album.description)
      || !localized(album.tagline) || !localized(album.quote)
      || typeof album.color !== 'string' || typeof album.colorAccent !== 'string'
      || !record(album.artwork) || typeof album.artwork.cover !== 'string'
      || typeof album.artwork.presentation !== 'string' || !Array.isArray(album.tracks)) {
      throw new Error('R2 catalog.json contains an invalid or duplicate album; no changes were made.');
    }
    albumIds.add(album.id);
    const trackIds = new Set<string>();
    for (const track of album.tracks) {
      if (!record(track) || !safeId(track.id) || trackIds.has(track.id)
        || typeof track.title !== 'string' || typeof track.file !== 'string'
        || (track.kind !== 'full' && track.kind !== 'preview')) {
        throw new Error(`R2 catalog.json contains an invalid or duplicate track in ${album.id}; no changes were made.`);
      }
      trackIds.add(track.id);
    }
  }
  return parsed as unknown as PublishedCatalog;
}

export function assertFullLibrarySafety(local: CatalogAlbum[], remote: PublishedCatalog): void {
  const localIds = new Set(local.map((album) => album.id));
  const missingAlbums = remote.albums.filter((album) => !localIds.has(album.id)).map((album) => album.id);
  const localTracks = local.reduce((sum, album) => sum + album.tracks.length, 0);
  const remoteTracks = remote.albums.reduce((sum, album) => sum + album.tracks.length, 0);
  const majorTrackDrop = remoteTracks - localTracks >= 2 && localTracks <= remoteTracks * 0.8;
  if (!missingAlbums.length && !majorTrackDrop) return;
  const reason = missingAlbums.length
    ? `Cloud-only album ID(s): ${missingAlbums.join(', ')}.`
    : `The local track count is at least 20% lower than the cloud catalog.`;
  throw new Error(`Safety check stopped music:sync before upload: local audio/ has ${local.length} album(s) and ${localTracks} track(s); R2 catalog.json has ${remote.albums.length} album(s) and ${remoteTracks} track(s). ${reason} If audio/ is intentionally the complete library, rerun pnpm music:sync --force.`);
}

export function referencedMediaKey(url: string): string | undefined {
  const key = url.split('?')[0];
  return key?.startsWith('albums/') ? key : undefined;
}

export function mediaKeysForTrack(track: CatalogTrack): string[] {
  return [track.file, track.lyricsUrl, track.artwork]
    .flatMap((url) => url ? [referencedMediaKey(url)].filter((key): key is string => Boolean(key)) : []);
}
