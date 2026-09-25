import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertUniqueAlbumIds } from '../src/data/assertUniqueAlbumIds.ts';
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

  it('caps 13, 16, and 24 albums at 12 unique entries in catalog order', () => {
    for (const count of [13, 16, 24]) {
      const source = albums(count);
      let draw = 0;
      const selected = selectCylinderAlbums(source, MAX_CYLINDER_ALBUMS, () => ((draw++ * 7) % 29) / 29);
      const selectedIds = selected.map((album) => album.id);

      assert.equal(selected.length, MAX_CYLINDER_ALBUMS);
      assert.equal(new Set(selectedIds).size, MAX_CYLINDER_ALBUMS);
      assert.deepEqual(selectedIds, [...selectedIds].sort((left, right) => {
        return Number(left.slice(6)) - Number(right.slice(6));
      }));
      assert.equal(new Set(source.map((album) => album.id)).size, count);
      assert.equal(draw, MAX_CYLINDER_ALBUMS);
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
});
