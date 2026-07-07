import { escapeHtml, safeExternalHref } from "@/lib/safe-url";

const URL_RE = /https?:\/\/[^\s<>"']+/g;

export function renderPlainTextWithLinks(text: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0];
    const index = match.index ?? 0;
    parts.push(escapeHtml(text.slice(lastIndex, index)));
    const safe = safeExternalHref(url);
    parts.push(
      safe
        ? `<a href="${escapeHtml(
            safe
          )}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`
        : escapeHtml(url)
    );
    lastIndex = index + url.length;
  }
  parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join("").replaceAll("\n", "<br />");
}

export function truncateText(text: string, max = 900): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max).trimEnd()}...`, truncated: true };
}
