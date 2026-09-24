/** Pure naming, ordering, identity, and resource-matching helpers for the build-time audio catalog. */

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac',
]);

export const SUPPORTED_LYRIC_EXTENSIONS = new Set(['.lrc']);

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif',
]);

export const RESERVED_AUDIO_DIRECTORIES = new Set(['full', 'generated', 'cache']);

export interface ResourceFile {
  /** Path relative to its album, always with forward slashes. */
  relativePath: string;
  fileName: string;
  directory: string;
  extension: string;
  stem: string;
  normalizedStem: string;
  trackNumber?: number;
  discNumber?: number;
}

export interface AudioResource extends ResourceFile {
  file: string;
  title: string;
  metadataTitle?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  year?: string;
  genre?: string;
}

export interface TextResource extends ResourceFile {
  text: string;
  publicUrl: string;
}

export interface ResolvedTrackResources {
  lyrics?: TextResource;
  artwork?: ResourceFile;
}

export type Warn = (message: string) => void;

const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

export function compareNaturalPath(a: string, b: string): number {
  return collator.compare(a.normalize('NFC'), b.normalize('NFC')) || (a < b ? -1 : a > b ? 1 : 0);
}

export function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[‘’]/gu, "'")
    .replace(/'/g, '').replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim().replace(/ +/g, ' ');
}

export function slugify(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

export function stripTrackNumberPrefix(value: string): string {
  return value.replace(/^\s*\d{1,3}(?:\s*[-._)]\s*|\s+)/, '').trim();
}

function pathSegments(relativePath: string): string[] {
  return relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
}

export function extractDiscNumber(relativePath: string): number | undefined {
  for (const segment of pathSegments(relativePath).slice(0, -1).reverse()) {
    const match = segment.match(/(?:^|[^\p{L}\p{N}])(?:disc|disk|cd)\s*0*(\d+)(?:$|[^\p{L}\p{N}])/iu);
    if (match) return Number(match[1]);
  }
  return undefined;
}

export function extractTrackNumber(relativePath: string): number | undefined {
  const segments = pathSegments(relativePath);
  const candidates = [segments.at(-1)?.replace(/\.[^.]*$/, ''), ...segments.slice(0, -1).reverse()];
  for (const candidate of candidates) {
    if (!candidate || /(?:^|[^\p{L}\p{N}])(?:disc|disk|cd)\s*\d+/iu.test(candidate)) continue;
    const match = candidate.match(/^\s*(\d{1,3})(?=$|[\s._)-])/u);
    if (match) return Number(match[1]);
  }
  return undefined;
}

export function createStableTrackId(
  albumId: string,
  title: string,
  discNumber?: number,
  trackNumber?: number,
): string {
  const titleId = slugify(title) || 'track';
  const position = trackNumber == null ? '' : `-d${discNumber ?? 1}-t${trackNumber}`;
  return `${albumId}-${titleId}${position}`;
}

function unique<T>(values: T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function sameDirectory(a: ResourceFile, b: ResourceFile): boolean {
  return a.directory.normalize('NFC') === b.directory.normalize('NFC');
}

function compatiblePosition(a: ResourceFile, b: ResourceFile): boolean {
  return (a.discNumber == null || b.discNumber == null || a.discNumber === b.discNumber)
    && (a.trackNumber == null || b.trackNumber == null || a.trackNumber === b.trackNumber);
}

function sameStem(a: ResourceFile, b: ResourceFile): boolean {
  return Boolean(a.normalizedStem) && a.normalizedStem === b.normalizedStem
    && compatiblePosition(a, b);
}

/**
 * Match optional resources in ordered, explicit passes. A candidate must be
 * unique on both sides at the winning pass; ambiguity is reported and skipped.
 */
export function matchAlbumResources<T extends ResourceFile>(
  tracks: readonly AudioResource[],
  resources: readonly T[],
  kind: 'lyrics' | 'artwork',
  warn: Warn,
): Map<string, T> {
  const matches = new Map<string, T>();
  const unresolved = new Set(tracks.map((track) => track.relativePath));
  const blocked = new Set<string>();
  const usedResources = new Set<string>();
  const warnedResources = new Set<string>();

  const tryPass = (label: string, predicate: (track: AudioResource, resource: T) => boolean) => {
    const proposals = new Map<string, T>();
    for (const track of tracks) {
      if (!unresolved.has(track.relativePath) || blocked.has(track.relativePath)) continue;
      const candidates = resources.filter((resource) => !usedResources.has(resource.relativePath)
        && predicate(track, resource));
      const candidate = unique(candidates);
      if (candidate) proposals.set(track.relativePath, candidate);
      else if (candidates.length > 1) {
        blocked.add(track.relativePath);
        for (const candidate of candidates) warnedResources.add(candidate.relativePath);
        warn(`${kind} ${track.relativePath}: ambiguous ${label} match; skipped.`);
      }
    }

    const proposalCounts = new Map<string, number>();
    for (const resource of proposals.values()) {
      proposalCounts.set(resource.relativePath, (proposalCounts.get(resource.relativePath) ?? 0) + 1);
    }
    for (const [trackPath, resource] of proposals) {
      if (proposalCounts.get(resource.relativePath) !== 1) {
        blocked.add(trackPath);
        warnedResources.add(resource.relativePath);
        warn(`${kind} ${resource.relativePath}: matches multiple tracks at ${label}; skipped.`);
        continue;
      }
      matches.set(trackPath, resource);
      unresolved.delete(trackPath);
      usedResources.add(resource.relativePath);
    }
  };

  tryPass('same-directory stem', (track, resource) => sameDirectory(track, resource) && sameStem(track, resource));
  tryPass('album stem', (track, resource) => sameStem(track, resource));
  tryPass('metadata title', (track, resource) => Boolean(track.metadataTitle)
    && normalizeTitle(track.metadataTitle!) === resource.normalizedStem
    && compatiblePosition(track, resource));

  if (tracks.length > 0) {
    for (const resource of resources) {
      const isAlbumCover = kind === 'artwork' && !resource.directory
        && (['cover', 'front', 'folder', 'album'].includes(normalizeTitle(resource.stem))
          || resources.filter((candidate) => !candidate.directory).length === 1);
      if (isAlbumCover) continue;
      if (!usedResources.has(resource.relativePath) && !warnedResources.has(resource.relativePath)) {
        warn(`${kind} ${resource.relativePath}: no unique track match; skipped.`);
      }
    }
  }

  return matches;
}

export function compareAudioOrder(a: AudioResource, b: AudioResource): number {
  return (a.discNumber ?? 1) - (b.discNumber ?? 1)
    || (a.trackNumber ?? Number.MAX_SAFE_INTEGER) - (b.trackNumber ?? Number.MAX_SAFE_INTEGER)
    || compareNaturalPath(a.relativePath, b.relativePath);
}
