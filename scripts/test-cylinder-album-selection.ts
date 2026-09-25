import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertUniqueAlbumIds } from '../src/data/assertUniqueAlbumIds.ts';
import { CYLINDER_CORS_CACHE_REVISION, CYLINDER_CORS_RETRY_REVISION, withCylinderCorsCacheKey } from '../src/lib/cylinderCorsCache.ts';
import { selectCylinderArtworkCandidates } from '../src/lib/cylinderArtworkFallback.ts';
import { MAX_CYLINDER_ALBUMS, selectCylinderAlbums } from '../src/lib/selectCylinderAlbums.ts';

function albums(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `album-${index + 1}` }));
}

describe('cylinder album selection', () => {
  it('keeps every album and its order at or below the display limit', () => {
    for (const count of [0, 1, 11, 12]) {
      const source = albums(count);
      const selected = selectCylinderAlbums(source);
      assert.deepEqual(selected, source);
      assert.notEqual(selected, source);
    }
  });

  it('keeps the 12-album cylinder limit for 12, 13, 20, and 30 simulated albums', () => {
    for (const count of [12, 13, 20, 30]) {
      const source = albums(count);
      let draw = 0;
      const selected = selectCylinderAlbums(source, MAX_CYLINDER_ALBUMS, () => ((draw++ * 7) % 29) / 29);
      const selectedIds = selected.map((album) => album.id);

      assert.equal(selected.length, Math.min(count, MAX_CYLINDER_ALBUMS));
      assert.equal(new Set(selectedIds).size, selected.length);
      assert.deepEqual(selectedIds, [...selectedIds].sort((left, right) => {
        return Number(left.slice(6)) - Number(right.slice(6));
      }));
      assert.equal(new Set(source.map((album) => album.id)).size, count);
      assert.equal(draw, count > MAX_CYLINDER_ALBUMS ? MAX_CYLINDER_ALBUMS : 0);
    }
  });

  it('allows every catalog position, including the newest album, to enter the sample', () => {
    const source = albums(13);
    const selected = selectCylinderAlbums(source, MAX_CYLINDER_ALBUMS, () => 0.999999);
    assert.ok(selected.some((album) => album.id === 'album-13'));
  });

  it('does not mutate the full catalog and rejects invalid limits', () => {
    const source = albums(16);
    const original = [...source];
    selectCylinderAlbums(source, 12, () => 0.5);
    assert.deepEqual(source, original);
    assert.throws(() => selectCylinderAlbums(source, -1), RangeError);
    assert.throws(() => selectCylinderAlbums(source, 1.5), RangeError);
  });

  it('rejects malformed or duplicate album IDs before rendering', () => {
    assert.doesNotThrow(() => assertUniqueAlbumIds([{ id: 'first' }, { id: 'second' }]));
    assert.throws(() => assertUniqueAlbumIds([{ id: 'duplicate' }, { id: 'duplicate' }]), /duplicate id/i);
    assert.throws(() => assertUniqueAlbumIds([{ id: ' ' }]), /valid id/i);
    assert.throws(() => assertUniqueAlbumIds(undefined), /albums array/i);
  });

  it('uses the fresh cross-origin cache key on the first request and a different retry key', () => {
    const source = 'https://music.example.test/albums/one/artwork/presentation.webp?v=abc';
    const page = 'https://site.example.test/';
    assert.equal(
      withCylinderCorsCacheKey(source, page, CYLINDER_CORS_CACHE_REVISION),
      `${source}&cylinder-cors=2`,
    );
    assert.equal(
      withCylinderCorsCacheKey(`${source}&cylinder-cors=2`, page, CYLINDER_CORS_CACHE_REVISION),
      undefined,
    );
    assert.equal(
      withCylinderCorsCacheKey(`${source}&cylinder-cors=2`, page, CYLINDER_CORS_RETRY_REVISION),
      `${source}&cylinder-cors=3`,
    );
    assert.equal(
      withCylinderCorsCacheKey('/audio/album/presentation.webp', page, CYLINDER_CORS_CACHE_REVISION),
      undefined,
    );
  });

  it('orders cylinder artwork fallbacks, removes duplicate URLs, and chooses one track image', () => {
    const candidates = selectCylinderArtworkCandidates({
      artwork: { presentation: '/album/presentation.webp', cover: '/album/cover.webp' },
      tracks: [
        { artwork: '/album/cover.webp' },
        { artwork: '/album/track-a.webp' },
        { artwork: '/album/track-a.webp' },
        { artwork: '/album/track-b.webp' },
      ],
    }, (source) => new URL(source, 'https://site.example.test/').href, () => 0.99);

    assert.deepEqual(candidates, [
      'https://site.example.test/album/presentation.webp',
      'https://site.example.test/album/cover.webp',
      'https://site.example.test/album/track-b.webp',
      'https://site.example.test/theme/taylor/finale.webp',
    ]);
    assert.equal(new Set(candidates).size, candidates.length);
  });

  it('uses cover, one track artwork, then independent Finale when presentation is the cover', () => {
    const candidates = selectCylinderArtworkCandidates({
      artwork: { presentation: '/same.webp', cover: '/same.webp' },
      tracks: [{ artwork: '/same.webp' }, { artwork: '/track.webp' }],
    }, (source) => new URL(source, 'https://site.example.test/').href, () => 0);

    assert.deepEqual(candidates, [
      'https://site.example.test/same.webp',
      'https://site.example.test/track.webp',
      'https://site.example.test/theme/taylor/finale.webp',
    ]);
  });
});
