interface CylinderArtworkAlbum {
  artwork: { cover: string; presentation: string };
  tracks: readonly { artwork?: string }[];
}

export function selectCylinderArtworkCandidates(
  album: CylinderArtworkAlbum,
  resolve: (source: string) => string,
  random: () => number = Math.random,
  finale = './theme/taylor/finale.webp',
): string[] {
  const presentation = album.artwork.presentation || album.artwork.cover;
  const cover = album.artwork.cover;
  const resolved = (source: string) => source ? resolve(source) : '';
  const primary = [resolved(presentation), resolved(cover)].filter(Boolean);
  const primaryUrls = new Set(primary.map(urlIdentity));
  const trackArtworks = [...new Set(album.tracks
    .map((track) => resolved(track.artwork ?? ''))
    .filter((source) => source && !primaryUrls.has(urlIdentity(source))))];

  const trackArtwork = trackArtworks.length
    ? trackArtworks[randomIndex(trackArtworks.length, random)]
    : undefined;

  return uniqueUrls([...primary, ...(trackArtwork ? [trackArtwork] : []), resolved(finale)]);
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function urlIdentity(source: string): string {
  try { return new URL(source, 'https://cylinder.invalid/').href; }
  catch { return source; }
}

function uniqueUrls(sources: string[]): string[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const identity = urlIdentity(source);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
