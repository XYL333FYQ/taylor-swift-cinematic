export const CYLINDER_CORS_CACHE_REVISION = '2';
export const CYLINDER_CORS_RETRY_REVISION = '3';

export function withCylinderCorsCacheKey(
  src: string,
  pageUrl: string,
  revision: string,
): string | undefined {
  try {
    const url = new URL(src, pageUrl);
    if (url.origin === new URL(pageUrl).origin || url.searchParams.get('cylinder-cors') === revision) {
      return undefined;
    }
    url.searchParams.set('cylinder-cors', revision);
    return url.href;
  } catch {
    return undefined;
  }
}
