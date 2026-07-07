import { slugify } from "@/lib/slugify";
import { buildEmbedUrl } from "@/lib/video-url";
import { escapeHtml, safeExternalHref, safeExternalImageUrl } from "@/lib/safe-url";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

export type WikitextRenderResult = {
  html: string;
  categories: string[];
  redirectSlug: string | null;
  summary: string | null;
  infoboxData: Record<string, string>;
};

function tokenized(input: string, build: (token: (html: string) => string) => string) {
  const tokens: string[] = [];
  const token = (html: string) => {
    const key = `@@OSC_WIKI_${tokens.length}@@`;
    tokens.push(html);
    return key;
  };
  let out = build(token);
  out = escapeHtml(out);
  out = out
    .replace(/'''''(.+?)'''''/g, "<strong><em>$1</em></strong>")
    .replace(/'''(.+?)'''/g, "<strong>$1</strong>")
    .replace(/''(.+?)''/g, "<em>$1</em>");
  tokens.forEach((html, i) => {
    out = out.replaceAll(`@@OSC_WIKI_${i}@@`, html);
  });
  return out;
}

function inline(raw: string): string {
  return tokenized(raw, (token) =>
    raw
      .replace(/\[\[([^|\]\n]+)\|([^\]\n]+)\]\]/g, (_m, target, label) => {
        const href = `/wiki/${slugify(String(target))}`;
        return token(
          `<a class="wiki-link" href="${href}">${escapeHtml(String(label).trim())}</a>`
        );
      })
      .replace(/\[\[([^\]\n]+)\]\]/g, (_m, target) => {
        const text = String(target).trim();
        return token(`<a class="wiki-link" href="/wiki/${slugify(text)}">${escapeHtml(text)}</a>`);
      })
      .replace(/\[(https?:\/\/[^\s\]\n]+)(?:\s+([^\]\n]+))?\]/g, (_m, href, label) => {
        const safe = safeExternalHref(String(href));
        if (!safe) return "";
        return token(
          `<a class="wiki-external" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            String(label || href).trim()
          )}</a>`
        );
      })
  );
}

function parseTemplateFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of body.split("|").slice(1)) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim().toLowerCase().replace(/\s+/g, "_");
    const value = rawValue.join("=").trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

function renderInfobox(kind: string, fields: Record<string, string>): string {
  const rows = Object.entries(fields).filter(([key]) => key !== "image");
  const image = fields.image ? safeExternalImageUrl(fields.image) : null;
  return [
    `<aside class="wiki-infobox">`,
    `<div class="wiki-infobox-title">${escapeHtml(fields.title || kind)}</div>`,
    image
      ? `<img class="wiki-infobox-image" src="${escapeHtml(image)}" alt="${escapeHtml(
          fields.title || kind
        )}" loading="lazy" referrerpolicy="no-referrer" />`
      : "",
    ...rows.map(
      ([key, value]) =>
        `<div class="wiki-infobox-row"><span>${escapeHtml(
          key.replaceAll("_", " ")
        )}</span><strong>${inline(value)}</strong></div>`
    ),
    `</aside>`,
  ].join("");
}

function renderImage(raw: string): string {
  const [urlRaw, ...parts] = raw.split("|").map((p) => p.trim());
  const src = safeExternalImageUrl(urlRaw);
  if (!src) {
    return `<p class="wiki-warning">Image blocked: only safe external image URLs are allowed.</p>`;
  }
  const style = parts.find((part) => ["thumb", "full", "right", "left"].includes(part)) ?? "thumb";
  const caption = parts.filter((part) => part !== style).join(" ");
  return `<figure class="wiki-image wiki-image-${escapeHtml(style)}"><img src="${escapeHtml(
    src
  )}" alt="${escapeHtml(caption || "Wiki image")}" loading="lazy" referrerpolicy="no-referrer" />${
    caption ? `<figcaption>${inline(caption)}</figcaption>` : ""
  }</figure>`;
}

function renderVideo(provider: "youtube" | "vimeo", id: string): string {
  const valid = provider === "youtube" ? YT_ID.test(id) : VIMEO_ID.test(id);
  if (!valid) return `<p class="wiki-warning">Video embed blocked: invalid ${provider} ID.</p>`;
  const src = buildEmbedUrl(provider, id);
  return `<div class="wiki-video"><iframe src="${escapeHtml(
    src
  )}" title="${provider} video" loading="lazy" allowfullscreen></iframe></div>`;
}

function renderTable(lines: string[]): string {
  const rows: string[][] = [];
  let current: string[] = [];
  let headerRow = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "|-") {
      if (current.length) rows.push(current);
      current = [];
    } else if (trimmed.startsWith("!") || trimmed.startsWith("|")) {
      if (trimmed.startsWith("!")) headerRow = true;
      current.push(
        ...trimmed
          .slice(1)
          .split(trimmed.startsWith("!") ? "!!" : "||")
          .map((cell) => cell.trim())
      );
    }
  }
  if (current.length) rows.push(current);
  return `<table class="wiki-table">${rows
    .map((row, rowIndex) =>
      `<tr>${row
        .map((cell) =>
          headerRow && rowIndex === 0
            ? `<th>${inline(cell)}</th>`
            : `<td>${inline(cell)}</td>`
        )
        .join("")}</tr>`
    )
    .join("")}</table>`;
}

function notice(label: string, tone = "neutral") {
  return `<div class="wiki-notice wiki-notice-${tone}">${escapeHtml(label)}</div>`;
}

function renderReferences(references: string[]): string {
  if (references.length === 0) return notice("No references have been added yet.", "blue");
  return `<section class="wiki-references"><h2 class="wiki-heading">References</h2><ol>${references
    .map(
      (reference, index) =>
        `<li id="wiki-ref-${index + 1}">${reference} <a href="#wiki-ref-call-${index + 1}" aria-label="Back to reference ${index + 1}">back</a></li>`
    )
    .join("")}</ol></section>`;
}

function renderNavbox(fields: Record<string, string>): string {
  const title = fields.title || "Related pages";
  const links = (fields.links ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [target, label] = entry.split("|").map((part) => part.trim());
      return `<a class="wiki-link" href="/wiki/${slugify(target)}">${escapeHtml(label || target)}</a>`;
    })
    .join("");
  return `<nav class="wiki-navbox"><strong>${escapeHtml(title)}</strong><div>${links}</div></nav>`;
}

export function renderWikitext(source: string): WikitextRenderResult {
  let text = source.replace(/\r\n?/g, "\n").slice(0, 80000);
  const references: string[] = [];
  let referencesRendered = false;
  const blockTokens: string[] = [];
  const blockToken = (html: string) => {
    const key = `@@OSC_WIKI_BLOCK_${blockTokens.length}@@`;
    blockTokens.push(html);
    return key;
  };
  const redirect = text.match(/^#REDIRECT\s+\[\[([^\]]+)\]\]/i);
  const categories: string[] = [];
  text = text.replace(/\[\[Category:([^\]]+)\]\]/gi, (_m, name) => {
    const clean = String(name).trim();
    if (clean) categories.push(clean);
    return "";
  });

  let infoboxData: Record<string, string> = {};
  const prefixBlocks: string[] = [];
  text = text.replace(/\{\{Infobox\s+([a-z ]+)([\s\S]*?)\}\}/gi, (_m, kind, body) => {
    infoboxData = { type: String(kind).trim(), ...parseTemplateFields(String(body)) };
    prefixBlocks.push(renderInfobox(String(kind).trim(), infoboxData));
    return "";
  });
  text = text.replace(/\{\{Navbox\s+show([\s\S]*?)\}\}/gi, (_m, body) =>
    blockToken(renderNavbox(parseTemplateFields(String(body))))
  );

  text = text.replace(/<ref>([\s\S]*?)<\/ref>/gi, (_m, body) => {
    references.push(inline(String(body).trim()));
    const index = references.length;
    return blockToken(
      `<sup class="wiki-ref-call" id="wiki-ref-call-${index}"><a href="#wiki-ref-${index}">[${index}]</a></sup>`
    );
  });

  text = text
    .replace(/\{\{Stub\}\}/gi, blockToken(notice("This page is a stub. You can help expand it.")))
    .replace(/\{\{Spoilers\}\}/gi, blockToken(notice("Spoilers ahead.", "yellow")))
    .replace(/\{\{Upcoming\}\}/gi, blockToken(notice("This page covers an upcoming show.", "blue")))
    .replace(/\{\{Outdated\}\}/gi, blockToken(notice("This page may contain outdated information.", "yellow")))
    .replace(/\{\{Needs sources\}\}/gi, blockToken(notice("This page needs sources.", "yellow")))
    .replace(/\{\{Needs citations\}\}/gi, blockToken(notice("This page needs sources.", "yellow")))
    .replace(/\{\{Needs cleanup\}\}/gi, blockToken(notice("This page needs cleanup.", "yellow")))
    .replace(/\{\{Cleanup\}\}/gi, blockToken(notice("This page needs cleanup.", "yellow")))
    .replace(/\{\{References\}\}/gi, () => {
      referencesRendered = true;
      return blockToken(renderReferences(references));
    })
    .replace(/\[\[Image:([^\]]+)\]\]/gi, (_m, body) => blockToken(renderImage(String(body))))
    .replace(/\[\[YouTube:([A-Za-z0-9_-]+)\]\]/gi, (_m, id) =>
      blockToken(renderVideo("youtube", String(id)))
    )
    .replace(/\[\[Vimeo:(\d+)\]\]/gi, (_m, id) =>
      blockToken(renderVideo("vimeo", String(id)))
    );

  const lines = text.split("\n");
  const blocks: string[] = [...prefixBlocks];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const blockIndex = trimmed.match(/^@@OSC_WIKI_BLOCK_(\d+)@@$/)?.[1];
    if (blockIndex != null) {
      const block = blockTokens[Number(blockIndex)];
      if (block) blocks.push(block);
      continue;
    }

    if (trimmed.startsWith("{|")) {
      const tableLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "|}") {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    const heading = trimmed.match(/^(={1,4})\s*(.+?)\s*\1$/);
    if (heading) {
      const level = Math.min(4, heading[1].length);
      blocks.push(`<h${level} class="wiki-heading">${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[*#]+ /.test(trimmed)) {
      const ordered = trimmed.startsWith("#");
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length && /^[*#]+ /.test(lines[i].trim())) {
        const item = lines[i].trim();
        const depth = item.match(/^[*#]+/)?.[0].length ?? 1;
        items.push(
          `<li style="margin-left:${Math.max(0, depth - 1)}rem">${inline(
            item.replace(/^[*#]+ /, "")
          )}</li>`
        );
        i++;
      }
      i--;
      blocks.push(`<${tag} class="wiki-list">${items.join("")}</${tag}>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push(`<blockquote class="wiki-quote">${inline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    blocks.push(`<p>${inline(trimmed)}</p>`);
  }

  if (references.length > 0 && !referencesRendered) {
    blocks.push(renderReferences(references));
  }

  const summary =
    lines
      .map((line) => line.trim().replace(/@@OSC_WIKI_BLOCK_\d+@@/g, "").trim())
      .find((line) => line && !line.startsWith("=") && !line.startsWith("{{")) ?? null;

  return {
    html: blocks.join("\n"),
    categories: [...new Set(categories)],
    redirectSlug: redirect ? slugify(redirect[1]) : null,
    summary,
    infoboxData,
  };
}
