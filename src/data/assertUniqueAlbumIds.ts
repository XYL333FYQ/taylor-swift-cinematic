export function assertUniqueAlbumIds(albums: unknown): asserts albums is readonly { id: string }[] {
  if (!Array.isArray(albums)) {
    throw new Error('Album catalog must contain an albums array.');
  }

  const seen = new Set<string>();
  for (const [index, album] of albums.entries()) {
    const id = album && typeof album === 'object' && 'id' in album ? album.id : undefined;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Album catalog item ${index + 1} is missing a valid id.`);
    }
    if (seen.has(id)) {
      throw new Error(`Album catalog contains duplicate id "${id}".`);
    }
    seen.add(id);
  }
}
