export interface LyricLine {
  timeMs?: number;
  text: string;
  translation?: string;
}

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

function parseTimestamp(minutes: string, seconds: string, fraction = '') {
  const milliseconds = fraction ? Number(fraction.padEnd(3, '0')) : 0;
  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + milliseconds;
}

export function parseLyrics(source?: string): LyricLine[] {
  if (!source?.trim()) return [];

  let offsetMs = 0;
  const parsed: Array<{ timeMs: number; text: string; order: number }> = [];
  const rows = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);

  for (const [order, rawRow] of rows.entries()) {
    const row = rawRow.trim();
    if (!row) continue;

    const offsetMatch = /^\[offset:([+-]?\d+)\]$/i.exec(row);
    if (offsetMatch) {
      offsetMs = Number(offsetMatch[1]);
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const tags: number[] = [];
    let match: RegExpExecArray | null;
    let contentStart = 0;
    while ((match = TIME_TAG.exec(row)) !== null) {
      tags.push(parseTimestamp(match[1], match[2], match[3] ?? ''));
      contentStart = TIME_TAG.lastIndex;
    }

    const text = row.slice(contentStart).trim();
    if (!text || !tags.length) continue;

    for (const timeMs of tags) {
      parsed.push({ timeMs: Math.max(0, timeMs + offsetMs), text, order });
    }
  }

  if (!parsed.length) {
    return rows
      .map((row) => row.trim())
      .filter((row) => row && !/^\[(?:ar|ti|al|by|re|ve|offset|length|la|kana):[^\]]*\]$/i.test(row))
      .map((text) => ({ text }));
  }

  parsed.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);

  const lines: LyricLine[] = [];
  for (const item of parsed) {
    const previous = lines.at(-1);
    if (previous?.timeMs === item.timeMs && !previous.translation) {
      previous.translation = item.text;
    } else {
      lines.push({ timeMs: item.timeMs, text: item.text });
    }
  }
  return lines;
}

export function findActiveLyric(lines: LyricLine[], currentTimeMs: number) {
  if (!lines.length || typeof lines[0].timeMs !== 'number') return -1;

  let low = 0;
  let high = lines.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const timeMs = lines[middle].timeMs;
    if (typeof timeMs === 'number' && timeMs <= currentTimeMs) {
      active = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(active, 0);
}
