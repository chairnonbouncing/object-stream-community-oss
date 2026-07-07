import { slugify } from "@/lib/slugify";

export type WikiTocEntry = { id: string; text: string; level: number };

/**
 * Some stored summaries contain leaked `@@OSC_WIKI_BLOCK_n@@` renderer tokens
 * (from before the extraction skipped tokenized template lines). Scrub them
 * wherever a summary is displayed.
 */
export function cleanWikiSummary(summary: string | null): string | null {
  if (!summary) return null;
  const clean = summary.replace(/@@OSC_WIKI_BLOCK_\d+@@/g, "").trim();
  return clean || null;
}

/**
 * Adds anchor ids to the headings of already-rendered wiki HTML and returns
 * the table of contents. Runs at display time so every stored page gets a TOC
 * without needing a re-render/migration.
 */
export function addHeadingAnchors(html: string): { html: string; toc: WikiTocEntry[] } {
  const toc: WikiTocEntry[] = [];
  const used = new Set<string>();

  const withIds = html.replace(
    /<h([1-4]) class="wiki-heading">([\s\S]*?)<\/h\1>/g,
    (match, levelStr: string, inner: string) => {
      const text = inner.replace(/<[^>]*>/g, "").trim();
      if (!text) return match;
      let id = slugify(text) || "section";
      while (used.has(id)) id = `${id}-2`;
      used.add(id);
      const level = Number(levelStr);
      // h1s inside articles are rare; treat them like h2 for TOC depth.
      toc.push({ id, text, level: Math.max(2, level) });
      return `<h${levelStr} class="wiki-heading" id="${id}">${inner}</h${levelStr}>`;
    }
  );

  return { html: withIds, toc };
}
