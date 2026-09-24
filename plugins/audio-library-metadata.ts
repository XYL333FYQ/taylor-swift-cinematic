import { parseFile } from 'music-metadata';

export interface AudioTags {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
  embeddedLyrics?: string;
}

export type AudioMetadataReaderResult = AudioTags;
export type AudioMetadataReader = (absolutePath: string) => Promise<AudioMetadataReaderResult>;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function positiveNumber(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Reads tags in Node during Vite scans; cover binaries stay out of the catalog. */
export async function readAudioMetadata(absolutePath: string): Promise<AudioMetadataReaderResult> {
  const metadata = await parseFile(absolutePath, { duration: false, skipCovers: true });
  const common = metadata.common;
  const date = cleanText(common.date);
  const year = common.year ? String(common.year) : date?.match(/\b\d{4}\b/)?.[0];
  const embeddedLyrics = common.lyrics?.flatMap((tag) => tag.syncText)
    .filter((line) => Number.isFinite(line.timestamp) && line.timestamp! >= 0 && Boolean(line.text.trim()))
    .map((line) => {
      const timestamp = Math.floor(line.timestamp!);
      const minutes = Math.floor(timestamp / 60_000);
      const seconds = Math.floor(timestamp % 60_000 / 1_000).toString().padStart(2, '0');
      const centiseconds = Math.floor(timestamp % 1_000 / 10).toString().padStart(2, '0');
      return `[${minutes}:${seconds}.${centiseconds}] ${line.text.trim()}`;
    }).join('\n');
  return {
    title: cleanText(common.title),
    artist: cleanText(common.artist),
    albumArtist: cleanText(common.albumartist),
    album: cleanText(common.album),
    year,
    genre: common.genre?.map((genre) => genre.trim()).filter(Boolean).join(', ') || undefined,
    trackNumber: positiveNumber(common.track.no),
    discNumber: positiveNumber(common.disk.no),
    embeddedLyrics: embeddedLyrics || undefined,
  };
}
