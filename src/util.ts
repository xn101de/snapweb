/**
 * Returns `url` only if it uses a scheme safe for an <img> / MediaSession
 * artwork source (http, https or data); otherwise `undefined`.
 *
 * Stream metadata (e.g. `artUrl`) is server-supplied and gets auto-fetched by
 * the browser, so reject anything else (`javascript:`, `file:`, ...) before it
 * reaches an image source.
 */
export function safeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const base = typeof window !== 'undefined' ? window.location.href : undefined;
    const protocol = new URL(url, base).protocol;
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'data:') {
      return url;
    }
  } catch {
    /* not a parseable URL */
  }
  return undefined;
}
