const IMAGE_EXT_RE = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i;
const TRUSTED_IMAGE_HOSTS = new Set([
  "i.ytimg.com",
  "img.youtube.com",
  "i.vimeocdn.com",
]);

export function parseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function safeExternalHref(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  return url.toString();
}

export function safeExternalImageUrl(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  if (TRUSTED_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
  if (!IMAGE_EXT_RE.test(url.pathname)) return null;
  return url.toString();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
