import { safeExternalHref, safeExternalImageUrl } from "@/lib/safe-url";
import { parseVideoUrl } from "@/lib/video-url";

export const WIKI_TEMPLATE_KINDS = [
  "Stub",
  "Spoilers",
  "Needs sources",
  "Needs cleanup",
  "Outdated",
  "Upcoming",
  "References",
  "Infobox show",
  "Infobox character",
  "Infobox episode",
  "Navbox show",
] as const;

export type WikiTemplateKind = (typeof WIKI_TEMPLATE_KINDS)[number];

export type InlineWikiNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  internalTarget?: string;
  externalHref?: string;
};

export type WikiInfoboxBlock = {
  type: "infobox";
  infoboxType: "show" | "character" | "episode" | "season" | "creator" | "upcoming show";
  fields: Record<string, string>;
};

export type WikiTableBlock = {
  type: "table";
  rows: string[][];
  headerRow: boolean;
};

export type VisualWikiBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "internalLink"; target: string; label?: string }
  | { type: "externalLink"; url: string; label?: string }
  | {
      type: "imageEmbed";
      url: string;
      caption?: string;
      alt?: string;
      style: "thumb" | "full" | "right" | "left";
    }
  | { type: "youtubeEmbed"; videoId: string; caption?: string }
  | { type: "vimeoEmbed"; videoId: string; caption?: string }
  | WikiInfoboxBlock
  | WikiTableBlock
  | { type: "template"; kind: WikiTemplateKind }
  | { type: "reference"; text: string; url?: string; title?: string }
  | { type: "referencesList" }
  | { type: "navbox"; title: string; links: Array<{ target: string; label?: string }> }
  | { type: "raw"; wikitext: string };

export type VisualWikiDocument = {
  blocks: VisualWikiBlock[];
  categories: string[];
};

export const BUILT_IN_WIKI_TEMPLATES: Array<{
  kind: WikiTemplateKind;
  label: string;
  description: string;
}> = [
  { kind: "Stub", label: "Stub", description: "Marks a page that needs expansion." },
  { kind: "Spoilers", label: "Spoilers", description: "Warns readers about spoilers." },
  { kind: "Needs sources", label: "Needs sources", description: "Requests citations." },
  { kind: "Needs cleanup", label: "Needs cleanup", description: "Requests cleanup edits." },
  { kind: "Outdated", label: "Outdated", description: "Marks information that may be old." },
  { kind: "Upcoming", label: "Upcoming", description: "Marks upcoming-show coverage." },
  { kind: "References", label: "References", description: "Adds the references list." },
  { kind: "Infobox show", label: "Infobox show", description: "Adds a show infobox." },
  {
    kind: "Infobox character",
    label: "Infobox character",
    description: "Adds a character infobox.",
  },
  {
    kind: "Infobox episode",
    label: "Infobox episode",
    description: "Adds an episode infobox.",
  },
  { kind: "Navbox show", label: "Navbox show", description: "Adds a show navigation box." },
];

const TEMPLATE_TO_WIKITEXT: Record<WikiTemplateKind, string> = {
  Stub: "{{Stub}}",
  Spoilers: "{{Spoilers}}",
  "Needs sources": "{{Needs sources}}",
  "Needs cleanup": "{{Needs cleanup}}",
  Outdated: "{{Outdated}}",
  Upcoming: "{{Upcoming}}",
  References: "{{References}}",
  "Infobox show":
    "{{Infobox show\n| title = \n| image = \n| creator = \n| status = Ongoing\n| age = Unknown\n| language = English\n| release_year = \n| genre = \n| official_channel = \n}}",
  "Infobox character":
    "{{Infobox character\n| name = \n| image = \n| show = \n| role = \n| first_appearance = \n| voice_actor = \n| status = \n}}",
  "Infobox episode":
    "{{Infobox episode\n| title = \n| image = \n| show = \n| season = \n| episode = \n| release_date = \n| runtime = \n| youtube = \n}}",
  "Navbox show": "{{Navbox show\n| title = \n| links = \n}}",
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

export function normalizeCategories(categories: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(categories) ? categories : (categories ?? "").split(",");
  return [
    ...new Set(
      raw
        .map((category) => category.trim())
        .filter(Boolean)
    ),
  ];
}

export function parseYouTubeVideoInput(value: string): string | null {
  const trimmed = value.trim();
  if (YT_ID.test(trimmed)) return trimmed;
  const parsed = parseVideoUrl(trimmed);
  return parsed.ok && parsed.provider === "youtube" ? parsed.providerVideoId : null;
}

export function parseVimeoVideoInput(value: string): string | null {
  const trimmed = value.trim();
  if (VIMEO_ID.test(trimmed)) return trimmed;
  const parsed = parseVideoUrl(trimmed);
  return parsed.ok && parsed.provider === "vimeo" ? parsed.providerVideoId : null;
}

function normalizeTemplateKind(value: string): WikiTemplateKind | null {
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (key === "stub") return "Stub";
  if (key === "spoilers" || key === "spoiler") return "Spoilers";
  if (key === "needs sources" || key === "needs citations") return "Needs sources";
  if (key === "needs cleanup" || key === "cleanup") return "Needs cleanup";
  if (key === "outdated") return "Outdated";
  if (key === "upcoming") return "Upcoming";
  if (key === "references" || key === "reflist") return "References";
  if (key === "infobox show") return "Infobox show";
  if (key === "infobox character") return "Infobox character";
  if (key === "infobox episode") return "Infobox episode";
  if (key === "navbox show") return "Navbox show";
  return null;
}

function parseTemplateFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const [rawKey, ...rawValue] = trimmed.slice(1).split("=");
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "_");
    const value = rawValue.join("=").trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function parseInfobox(wikitext: string): WikiInfoboxBlock | null {
  const match = wikitext.match(/^\{\{Infobox\s+([a-z ]+)([\s\S]*?)\}\}$/i);
  if (!match) return null;
  const rawType = match[1].trim().toLowerCase() as WikiInfoboxBlock["infoboxType"];
  const allowed = ["show", "character", "episode", "season", "creator", "upcoming show"];
  return {
    type: "infobox",
    infoboxType: allowed.includes(rawType) ? rawType : "show",
    fields: parseTemplateFields(match[2]),
  };
}

function parseNavbox(wikitext: string): VisualWikiBlock | null {
  const match = wikitext.match(/^\{\{Navbox\s+show([\s\S]*?)\}\}$/i);
  if (!match) return null;
  const fields = parseTemplateFields(match[1]);
  const links = (fields.links ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [target, label] = entry.split("|").map((part) => part.trim());
      return { target, ...(label ? { label } : {}) };
    });
  return { type: "navbox", title: fields.title ?? "", links };
}

function parseTable(lines: string[]): WikiTableBlock {
  const rows: string[][] = [];
  let current: string[] = [];
  let headerRow = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "|-" || line === "|}") {
      if (current.length) rows.push(current);
      current = [];
      continue;
    }
    if (line.startsWith("!")) {
      headerRow = true;
      current.push(...line.slice(1).split("!!").map((cell) => cell.trim()));
    } else if (line.startsWith("|") && !line.startsWith("{|")) {
      current.push(...line.slice(1).split("||").map((cell) => cell.trim()));
    }
  }
  if (current.length) rows.push(current);
  return { type: "table", rows: rows.length ? rows : [["Header"], ["Cell"]], headerRow };
}

export function parseWikitextToVisualDocument(wikitext: string): VisualWikiDocument {
  const categories: string[] = [];
  const withoutCategories = wikitext.replace(/\[\[Category:([^\]]+)\]\]/gi, (_match, name) => {
    categories.push(String(name).trim());
    return "";
  });
  const lines = withoutCategories.replace(/\r\n?/g, "\n").split("\n");
  const blocks: VisualWikiBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^\{\{(?:Infobox|Navbox)\s+/i.test(trimmed)) {
      const collected = [line];
      while (!collected.join("\n").includes("}}") && i < lines.length - 1) {
        i++;
        collected.push(lines[i]);
      }
      const blockText = collected.join("\n");
      const infobox = parseInfobox(blockText);
      const navbox = parseNavbox(blockText);
      blocks.push(infobox ?? navbox ?? { type: "raw", wikitext: blockText });
      continue;
    }

    if (trimmed.startsWith("{|")) {
      const tableLines = [line];
      while (i < lines.length - 1 && lines[i].trim() !== "|}") {
        i++;
        tableLines.push(lines[i]);
      }
      blocks.push(parseTable(tableLines));
      continue;
    }

    const template = trimmed.match(/^\{\{([^|}]+)\}\}$/);
    if (template) {
      const kind = normalizeTemplateKind(template[1]);
      blocks.push(kind === "References" ? { type: "referencesList" } : kind ? { type: "template", kind } : { type: "raw", wikitext: line });
      continue;
    }

    const image = trimmed.match(/^\[\[Image:([^\]]+)\]\]$/i);
    if (image) {
      const [url = "", maybeStyle = "", ...captionParts] = image[1]
        .split("|")
        .map((part) => part.trim());
      const style = ["thumb", "full", "right", "left"].includes(maybeStyle)
        ? (maybeStyle as "thumb" | "full" | "right" | "left")
        : "thumb";
      blocks.push({
        type: "imageEmbed",
        url,
        style,
        caption: captionParts.join(" ") || (style === "thumb" ? "" : maybeStyle),
      });
      continue;
    }

    const youtube = trimmed.match(/^\[\[YouTube:([A-Za-z0-9_-]+)\]\]$/i);
    if (youtube) {
      blocks.push({ type: "youtubeEmbed", videoId: youtube[1] });
      continue;
    }
    const vimeo = trimmed.match(/^\[\[Vimeo:(\d+)\]\]$/i);
    if (vimeo) {
      blocks.push({ type: "vimeoEmbed", videoId: vimeo[1] });
      continue;
    }

    const ref = trimmed.match(/^<ref>([\s\S]+)<\/ref>$/i);
    if (ref) {
      blocks.push({ type: "reference", text: ref[1].trim() });
      continue;
    }

    const heading = trimmed.match(/^(={1,3})\s*(.+?)\s*\1$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }

    if (/^\* /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\* /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\* /, ""));
        i++;
      }
      i--;
      blocks.push({ type: "bulletList", items });
      continue;
    }

    if (/^# /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^# /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^# /, ""));
        i++;
      }
      i--;
      blocks.push({ type: "numberedList", items });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push({ type: "quote", text: trimmed.slice(2).trim() });
      continue;
    }

    if (trimmed.startsWith("<") || trimmed.startsWith("{{")) {
      blocks.push({ type: "raw", wikitext: line });
      continue;
    }

    blocks.push({ type: "paragraph", text: line.trim() });
  }

  return {
    blocks: blocks.length ? blocks : [{ type: "paragraph", text: "" }],
    categories: normalizeCategories(categories),
  };
}

function categoryLines(categories: string[]) {
  return normalizeCategories(categories)
    .map((category) => `[[Category:${category}]]`)
    .join("\n");
}

function infoboxToWikitext(block: WikiInfoboxBlock) {
  const fields = Object.entries(block.fields)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `| ${key} = ${value.trim()}`);
  return [`{{Infobox ${block.infoboxType}`, ...fields, "}}"].join("\n");
}

function tableToWikitext(block: WikiTableBlock) {
  const rows = block.rows.length ? block.rows : [["Header"], ["Cell"]];
  const out = ['{| class="wikitable"'];
  rows.forEach((row, index) => {
    if (index > 0) out.push("|-");
    const prefix = block.headerRow && index === 0 ? "!" : "|";
    out.push(`${prefix} ${row.join(prefix === "!" ? " !! " : " || ")}`);
  });
  out.push("|}");
  return out.join("\n");
}

function navboxToWikitext(block: Extract<VisualWikiBlock, { type: "navbox" }>) {
  const links = block.links
    .filter((link) => link.target.trim())
    .map((link) => `${link.target.trim()}${link.label?.trim() ? `|${link.label.trim()}` : ""}`)
    .join(", ");
  return ["{{Navbox show", `| title = ${block.title.trim()}`, `| links = ${links}`, "}}"].join("\n");
}

function referenceToWikitext(block: Extract<VisualWikiBlock, { type: "reference" }>) {
  const url = block.url ? safeExternalHref(block.url) : null;
  if (url && block.title?.trim()) {
    return `<ref>[${url} ${block.title.trim()}]${block.text.trim() ? ` - ${block.text.trim()}` : ""}</ref>`;
  }
  if (url) return `<ref>${url}${block.text.trim() ? ` - ${block.text.trim()}` : ""}</ref>`;
  return `<ref>${block.text.trim()}</ref>`;
}

export function blockToWikitext(block: VisualWikiBlock): string {
  if (block.type === "paragraph") return block.text.trim();
  if (block.type === "heading") {
    const marks = "=".repeat(Math.min(3, Math.max(1, block.level)));
    return `${marks} ${block.text.trim() || "Heading"} ${marks}`;
  }
  if (block.type === "bulletList") {
    return block.items.filter((item) => item.trim()).map((item) => `* ${item.trim()}`).join("\n");
  }
  if (block.type === "numberedList") {
    return block.items.filter((item) => item.trim()).map((item) => `# ${item.trim()}`).join("\n");
  }
  if (block.type === "quote") return `> ${block.text.trim()}`;
  if (block.type === "internalLink") {
    const target = block.target.trim();
    if (!target) return "";
    return block.label?.trim() ? `[[${target}|${block.label.trim()}]]` : `[[${target}]]`;
  }
  if (block.type === "externalLink") {
    const url = safeExternalHref(block.url);
    if (!url) return "";
    return block.label?.trim() ? `[${url} ${block.label.trim()}]` : `[${url}]`;
  }
  if (block.type === "imageEmbed") {
    const url = safeExternalImageUrl(block.url);
    if (!url) return "";
    const parts = [url, block.style || "thumb", block.caption?.trim() ?? ""].filter(Boolean);
    return `[[Image:${parts.join("|")}]]`;
  }
  if (block.type === "youtubeEmbed") {
    const id = parseYouTubeVideoInput(block.videoId);
    return id ? `[[YouTube:${id}]]` : "";
  }
  if (block.type === "vimeoEmbed") {
    const id = parseVimeoVideoInput(block.videoId);
    return id ? `[[Vimeo:${id}]]` : "";
  }
  if (block.type === "infobox") return infoboxToWikitext(block);
  if (block.type === "table") return tableToWikitext(block);
  if (block.type === "template") return TEMPLATE_TO_WIKITEXT[block.kind];
  if (block.type === "reference") return referenceToWikitext(block);
  if (block.type === "referencesList") return "{{References}}";
  if (block.type === "navbox") return navboxToWikitext(block);
  return block.wikitext.trim();
}

export function visualDocumentToWikitext(
  document: VisualWikiDocument,
  categories = document.categories
): string {
  const body = document.blocks
    .map(blockToWikitext)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
  const cats = categoryLines(categories);
  return [body, cats].filter(Boolean).join("\n\n");
}

export function newBlockForTemplate(kind: WikiTemplateKind): VisualWikiBlock {
  if (kind === "References") return { type: "referencesList" };
  if (kind === "Infobox show") {
    return {
      type: "infobox",
      infoboxType: "show",
      fields: {
        title: "",
        image: "",
        creator: "",
        status: "Ongoing",
        age: "Unknown",
        language: "English",
        release_year: "",
        genre: "",
        official_channel: "",
      },
    };
  }
  if (kind === "Infobox character") {
    return {
      type: "infobox",
      infoboxType: "character",
      fields: {
        name: "",
        image: "",
        show: "",
        role: "",
        first_appearance: "",
        voice_actor: "",
        status: "",
      },
    };
  }
  if (kind === "Infobox episode") {
    return {
      type: "infobox",
      infoboxType: "episode",
      fields: {
        title: "",
        image: "",
        show: "",
        season: "",
        episode: "",
        release_date: "",
        runtime: "",
        youtube: "",
      },
    };
  }
  if (kind === "Navbox show") return { type: "navbox", title: "", links: [] };
  return { type: "template", kind };
}
