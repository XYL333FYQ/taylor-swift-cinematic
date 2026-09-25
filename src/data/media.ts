/** One address boundary for local scanner keys and published R2 object keys. */
export function catalogUrl(): string {
  if (import.meta.env.DEV) return `${import.meta.env.BASE_URL}catalog.json`;
  const configured = import.meta.env.VITE_CATALOG_URL;
  if (!configured) throw new Error('VITE_CATALOG_URL is required for a production catalog.');
  return configured;
}

export function resolveMediaUrl(key: string): string {
  if (!key) return '';
  if (/^(https?:|blob:|data:)/i.test(key)) return key;
  // The scanner's final artwork fallback belongs to the site theme, not R2.
  if (key.replace(/^\.\//, '').startsWith('theme/')) {
    return `${import.meta.env.BASE_URL}${key.replace(/^\.\//, '')}`;
  }
  if (import.meta.env.DEV) return `${import.meta.env.BASE_URL}${key.replace(/^\/+/, '')}`;
  return new URL(key.replace(/^\/+/, ''), catalogUrl()).href;
}
