"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  BookOpen,
  Braces,
  Code2,
  Eye,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  PanelTop,
  Pilcrow,
  Plus,
  Quote,
  Redo2,
  Save,
  Table2,
  Trash2,
  Undo2,
  Video,
  X,
} from "lucide-react";
import { saveWikiPage } from "@/actions/wiki";
import { WIKI_PAGE_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { renderWikitext } from "@/lib/wiki-renderer";
import {
  BUILT_IN_WIKI_TEMPLATES,
  WIKI_TEMPLATE_KINDS,
  blockToWikitext,
  newBlockForTemplate,
  normalizeCategories,
  parseVimeoVideoInput,
  parseWikitextToVisualDocument,
  parseYouTubeVideoInput,
  visualDocumentToWikitext,
  type VisualWikiBlock,
  type VisualWikiDocument,
  type WikiInfoboxBlock,
  type WikiTemplateKind,
} from "@/lib/wiki-visual";
import { safeExternalHref, safeExternalImageUrl } from "@/lib/safe-url";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

type EditorMode = "visual" | "source" | "preview";
type InsertKind =
  | "internalLink"
  | "externalLink"
  | "image"
  | "youtube"
  | "vimeo"
  | "table"
  | "infobox"
  | "template"
  | "reference"
  | "navbox"
  | null;

type WikiEditorPage = {
  title: string;
  pageType: string;
  relatedShowId: string | null;
  relatedVideoId: string | null;
  mainImageUrl: string | null;
  categories: string;
  contentWikitext: string;
  isHidden: boolean;
  isProtected: boolean;
};

type DraftState = {
  version: 1;
  mode: EditorMode;
  title: string;
  pageType: string;
  relatedShowId: string;
  mainImageUrl: string;
  categories: string;
  editSummary: string;
  contentWikitext: string;
  isHidden: boolean;
  isProtected: boolean;
  savedAt: string;
};

const EMPTY_DOCUMENT: VisualWikiDocument = {
  blocks: [{ type: "template", kind: "Stub" }, { type: "heading", level: 2, text: "Summary" }],
  categories: [],
};

const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ codeBlock: false }),
  LinkExtension.configure({
    openOnClick: false,
    autolink: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
];

function inlineFromTiptap(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      let text = node.text ?? inlineFromTiptap(node.content);
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = `'''${text}'''`;
        if (mark.type === "italic") text = `''${text}''`;
        if (mark.type === "link") {
          const href = String(mark.attrs?.href ?? "");
          if (href.startsWith("/wiki/")) {
            const target = href.slice("/wiki/".length).replaceAll("-", " ");
            text = `[[${target}|${text}]]`;
          } else if (safeExternalHref(href)) {
            text = `[${href} ${text}]`;
          }
        }
      }
      return text;
    })
    .join("");
}

function listItemsFromTiptap(node: JSONContent): string[] {
  return (node.content ?? [])
    .filter((child) => child.type === "listItem")
    .map((child) => inlineFromTiptap(child.content?.flatMap((item) => item.content ?? []) ?? []))
    .filter(Boolean);
}

function tableFromTiptap(node: JSONContent): VisualWikiBlock | null {
  const rows = (node.content ?? [])
    .filter((child) => child.type === "tableRow")
    .map((row) =>
      (row.content ?? [])
        .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
        .map((cell) => inlineFromTiptap(cell.content?.flatMap((item) => item.content ?? []) ?? []))
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  const firstRow = node.content?.[0]?.content ?? [];
  return {
    type: "table",
    rows,
    headerRow: firstRow.some((cell) => cell.type === "tableHeader"),
  };
}

function tiptapJsonToBlocks(json: JSONContent): VisualWikiBlock[] {
  return (json.content ?? []).flatMap((node): VisualWikiBlock[] => {
    if (node.type === "paragraph") {
      const text = inlineFromTiptap(node.content);
      return text.trim() ? [{ type: "paragraph", text }] : [];
    }
    if (node.type === "heading") {
      return [
        {
          type: "heading",
          level: Math.min(3, Number(node.attrs?.level ?? 2)) as 1 | 2 | 3,
          text: inlineFromTiptap(node.content) || "Heading",
        },
      ];
    }
    if (node.type === "bulletList") return [{ type: "bulletList", items: listItemsFromTiptap(node) }];
    if (node.type === "orderedList") return [{ type: "numberedList", items: listItemsFromTiptap(node) }];
    if (node.type === "blockquote") {
      return [{ type: "quote", text: inlineFromTiptap(node.content?.flatMap((item) => item.content ?? []) ?? []) }];
    }
    if (node.type === "table") {
      const table = tableFromTiptap(node);
      return table ? [table] : [];
    }
    return [];
  });
}

function draftKey(currentSlug: string | null, title: string) {
  return `osc-wiki-visual-draft:v1:${currentSlug ?? `new:${title || "untitled"}`}`;
}

function readRecoveredDraft(key: string, originalWikitext: string): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftState;
    return parsed.version === 1 && parsed.contentWikitext !== originalWikitext
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function timestampLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleString();
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function ToolbarButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line text-cream/70 transition hover:border-osc-blue/60 hover:text-osc-blue",
        active && "border-osc-blue/70 bg-osc-blue/10 text-osc-blue"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function RichTextScratchPad({ onInsert }: { onInsert: (blocks: VisualWikiBlock[]) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: TIPTAP_EXTENSIONS,
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "wiki-visual-prose min-h-32 rounded-2xl border border-line bg-night/35 px-4 py-3 text-sm text-cream outline-none",
      },
    },
  });

  function addSelectionLink(kind: "internal" | "external") {
    if (!editor) return;
    const value = window.prompt(kind === "internal" ? "Wiki page title" : "Safe external URL");
    if (!value) return;
    if (kind === "external" && !safeExternalHref(value)) return;
    const href = kind === "internal" ? `/wiki/${value.trim().toLowerCase().replace(/\s+/g, "-")}` : value;
    editor.chain().focus().setLink({ href }).run();
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm font-bold text-cream/75">Rich text pad</p>
        <ToolbarButton label="Paragraph" icon={Pilcrow} onClick={() => editor?.chain().focus().setParagraph().run()} />
        <ToolbarButton label="Heading 1" icon={Heading1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton label="Heading 2" icon={Heading2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton label="Heading 3" icon={Heading3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolbarButton label="Bold" icon={Bold} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <ToolbarButton label="Italic" icon={Italic} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="Internal link" icon={BookOpen} onClick={() => addSelectionLink("internal")} />
        <ToolbarButton label="External link" icon={LinkIcon} onClick={() => addSelectionLink("external")} />
        <ToolbarButton label="Bullet list" icon={List} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="Numbered list" icon={ListOrdered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="Quote" icon={Quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton label="Insert table" icon={Table2} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <ToolbarButton label="Undo" icon={Undo2} onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton label="Redo" icon={Redo2} onClick={() => editor?.chain().focus().redo().run()} />
      </div>
      <div className="mt-3">
        <EditorContent editor={editor} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!editor) return;
            const blocks = tiptapJsonToBlocks(editor.getJSON());
            if (blocks.length > 0) {
              onInsert(blocks);
              editor.commands.clearContent();
            }
          }}
        >
          Add to article
        </Button>
      </div>
    </section>
  );
}

export function WikiEditorForm({
  currentSlug,
  page,
  shows,
  categoryNames,
  wikiPageTitles,
  isAdmin,
}: {
  currentSlug: string | null;
  page: WikiEditorPage;
  shows: Array<{ id: string; title: string }>;
  categoryNames: string[];
  wikiPageTitles: string[];
  isAdmin: boolean;
}) {
  const action = saveWikiPage.bind(null, currentSlug);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const initialDocument = useMemo(
    () => parseWikitextToVisualDocument(page.contentWikitext || "{{Stub}}\n\n== Summary ==\n"),
    [page.contentWikitext]
  );

  const [mode, setMode] = useState<EditorMode>("visual");
  const [document, setDocument] = useState<VisualWikiDocument>(initialDocument);
  const [source, setSource] = useState(page.contentWikitext || visualDocumentToWikitext(EMPTY_DOCUMENT));
  const [title, setTitle] = useState(page.title);
  const [pageType, setPageType] = useState(page.pageType || "Other");
  const [relatedShowId, setRelatedShowId] = useState(page.relatedShowId ?? "");
  const [mainImageUrl, setMainImageUrl] = useState(page.mainImageUrl ?? "");
  const [categoryText, setCategoryText] = useState(
    normalizeCategories(page.categories || initialDocument.categories).join(", ")
  );
  const [editSummary, setEditSummary] = useState("");
  const [isHidden, setIsHidden] = useState(page.isHidden);
  const [isProtected, setIsProtected] = useState(page.isProtected);
  const [activeInsert, setActiveInsert] = useState<InsertKind>(null);
  const [insertDraft, setInsertDraft] = useState<Record<string, string>>({});
  const [recoveredDraft, setRecoveredDraft] = useState<DraftState | null>(() =>
    readRecoveredDraft(draftKey(currentSlug, page.title), page.contentWikitext)
  );

  const categories = useMemo(() => normalizeCategories(categoryText), [categoryText]);
  const visualWikitext = useMemo(
    () => visualDocumentToWikitext({ ...document, categories }, categories),
    [document, categories]
  );
  const currentWikitext = mode === "source" ? source : visualWikitext;
  const preview = useMemo(() => renderWikitext(currentWikitext), [currentWikitext]);
  const activeDraftKey = useMemo(() => draftKey(currentSlug, title), [currentSlug, title]);
  const hasReferences =
    currentWikitext.includes("<ref>") && !/\{\{References\}\}/i.test(currentWikitext);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft: DraftState = {
        version: 1,
        mode,
        title,
        pageType,
        relatedShowId,
        mainImageUrl,
        categories: categoryText,
        editSummary,
        contentWikitext: currentWikitext,
        isHidden,
        isProtected,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(activeDraftKey, JSON.stringify(draft));
      } catch {
        // Local drafts are best-effort only.
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    activeDraftKey,
    categoryText,
    currentWikitext,
    editSummary,
    isHidden,
    isProtected,
    mainImageUrl,
    mode,
    pageType,
    relatedShowId,
    title,
  ]);

  function switchMode(nextMode: EditorMode) {
    if (mode === "source" && nextMode !== "source") {
      const parsed = parseWikitextToVisualDocument(source);
      setDocument(parsed);
      setCategoryText(parsed.categories.join(", "));
    }
    if (mode !== "source" && nextMode === "source") {
      setSource(visualWikitext);
    }
    setMode(nextMode);
  }

  function appendBlocks(blocks: VisualWikiBlock[]) {
    setDocument((current) => ({ ...current, blocks: [...current.blocks, ...blocks] }));
  }

  function replaceBlock(index: number, block: VisualWikiBlock) {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.map((item, i) => (i === index ? block : item)),
    }));
  }

  function removeBlock(index: number) {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((_, i) => i !== index),
    }));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setDocument((current) => {
      const next = [...current.blocks];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, blocks: next };
    });
  }

  function openInsert(kind: Exclude<InsertKind, null>) {
    setActiveInsert(kind);
    setInsertDraft(
      kind === "table"
        ? { rows: "3", cols: "3" }
        : kind === "template"
          ? { kind: "Stub" }
          : kind === "infobox"
            ? { infoboxType: "show", title: title || "", image: "" }
            : {}
    );
  }

  function confirmInsert() {
    if (!activeInsert) return;
    const draft = insertDraft;
    let block: VisualWikiBlock | null = null;
    if (activeInsert === "internalLink") {
      block = { type: "internalLink", target: draft.target ?? "", label: draft.label };
    } else if (activeInsert === "externalLink") {
      block = { type: "externalLink", url: draft.url ?? "", label: draft.label };
    } else if (activeInsert === "image") {
      block = {
        type: "imageEmbed",
        url: draft.url ?? "",
        caption: draft.caption,
        alt: draft.alt,
        style: (draft.style as "thumb" | "full" | "right" | "left") || "thumb",
      };
    } else if (activeInsert === "youtube") {
      block = { type: "youtubeEmbed", videoId: parseYouTubeVideoInput(draft.video ?? "") ?? draft.video ?? "" };
    } else if (activeInsert === "vimeo") {
      block = { type: "vimeoEmbed", videoId: parseVimeoVideoInput(draft.video ?? "") ?? draft.video ?? "" };
    } else if (activeInsert === "table") {
      const rows = Math.max(1, Math.min(20, Number(draft.rows) || 3));
      const cols = Math.max(1, Math.min(8, Number(draft.cols) || 3));
      block = {
        type: "table",
        headerRow: true,
        rows: Array.from({ length: rows }, (_, row) =>
          Array.from({ length: cols }, (_, col) => (row === 0 ? `Header ${col + 1}` : "Cell"))
        ),
      };
    } else if (activeInsert === "infobox") {
      block = {
        type: "infobox",
        infoboxType: (draft.infoboxType as WikiInfoboxBlock["infoboxType"]) || "show",
        fields: {
          title: draft.title ?? title,
          image: draft.image ?? "",
          status: draft.status ?? "",
          show: draft.show ?? "",
          role: draft.role ?? "",
          creator: draft.creator ?? "",
        },
      };
    } else if (activeInsert === "template") {
      block = newBlockForTemplate((draft.kind as WikiTemplateKind) || "Stub");
    } else if (activeInsert === "reference") {
      block = { type: "reference", text: draft.text ?? "", url: draft.url, title: draft.title };
    } else if (activeInsert === "navbox") {
      block = {
        type: "navbox",
        title: draft.title ?? title,
        links: splitLines(draft.links ?? "").map((line) => {
          const [target, label] = line.split("|").map((part) => part.trim());
          return { target, ...(label ? { label } : {}) };
        }),
      };
    }
    if (block) appendBlocks([block]);
    setActiveInsert(null);
    setInsertDraft({});
  }

  function restoreDraft(draft: DraftState) {
    setMode(draft.mode);
    setTitle(draft.title);
    setPageType(draft.pageType);
    setRelatedShowId(draft.relatedShowId);
    setMainImageUrl(draft.mainImageUrl);
    setCategoryText(draft.categories);
    setEditSummary(draft.editSummary);
    setIsHidden(draft.isHidden);
    setIsProtected(draft.isProtected);
    setSource(draft.contentWikitext);
    setDocument(parseWikitextToVisualDocument(draft.contentWikitext));
    setRecoveredDraft(null);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="contentWikitext" value={currentWikitext} />
      <input type="hidden" name="categories" value={categoryText} />
      <input type="hidden" name="relatedVideoId" value={page.relatedVideoId ?? ""} />
      {isAdmin ? (
        <>
          <input type="hidden" name="isHidden" value={isHidden ? "on" : ""} />
          <input type="hidden" name="isProtected" value={isProtected ? "on" : ""} />
        </>
      ) : null}

      <FormError message={state?.error} />
      {recoveredDraft ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-osc-star/50 bg-osc-star/10 px-4 py-3 text-sm text-cream">
          <span>
            Recovered unsaved draft from {timestampLabel(recoveredDraft.savedAt)}.
          </span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => restoreDraft(recoveredDraft)}>
              Restore
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                localStorage.removeItem(activeDraftKey);
                setRecoveredDraft(null);
              }}
            >
              Discard
            </Button>
          </span>
        </div>
      ) : null}

      <div className="sticky top-[73px] z-30 rounded-3xl border border-line bg-surface/95 p-3 shadow-xl shadow-black/20 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton label="Visual mode" icon={FileText} active={mode === "visual"} onClick={() => switchMode("visual")} />
          <ToolbarButton label="Source mode" icon={Code2} active={mode === "source"} onClick={() => switchMode("source")} />
          <ToolbarButton label="Preview mode" icon={Eye} active={mode === "preview"} onClick={() => switchMode("preview")} />
          <span className="mx-1 h-8 w-px bg-line" />
          <ToolbarButton label="Paragraph block" icon={Pilcrow} onClick={() => appendBlocks([{ type: "paragraph", text: "" }])} />
          <ToolbarButton label="Heading 1 block" icon={Heading1} onClick={() => appendBlocks([{ type: "heading", level: 1, text: "Heading" }])} />
          <ToolbarButton label="Heading 2 block" icon={Heading2} onClick={() => appendBlocks([{ type: "heading", level: 2, text: "Heading" }])} />
          <ToolbarButton label="Heading 3 block" icon={Heading3} onClick={() => appendBlocks([{ type: "heading", level: 3, text: "Heading" }])} />
          <ToolbarButton label="Bullet list block" icon={List} onClick={() => appendBlocks([{ type: "bulletList", items: ["List item"] }])} />
          <ToolbarButton label="Numbered list block" icon={ListOrdered} onClick={() => appendBlocks([{ type: "numberedList", items: ["List item"] }])} />
          <ToolbarButton label="Quote block" icon={Quote} onClick={() => appendBlocks([{ type: "quote", text: "" }])} />
          <span className="mx-1 h-8 w-px bg-line" />
          <ToolbarButton label="Insert internal link" icon={BookOpen} onClick={() => openInsert("internalLink")} />
          <ToolbarButton label="Insert external link" icon={LinkIcon} onClick={() => openInsert("externalLink")} />
          <ToolbarButton label="Insert image URL" icon={Image} onClick={() => openInsert("image")} />
          <ToolbarButton label="Insert YouTube" icon={Video} onClick={() => openInsert("youtube")} />
          <ToolbarButton label="Insert Vimeo" icon={Video} onClick={() => openInsert("vimeo")} />
          <ToolbarButton label="Insert table" icon={Table2} onClick={() => openInsert("table")} />
          <ToolbarButton label="Insert infobox" icon={PanelTop} onClick={() => openInsert("infobox")} />
          <ToolbarButton label="Insert template" icon={Braces} onClick={() => openInsert("template")} />
          <ToolbarButton label="Insert reference" icon={BookOpen} onClick={() => openInsert("reference")} />
          <ToolbarButton label="Insert navbox" icon={PanelTop} onClick={() => openInsert("navbox")} />
          <div className="ml-auto flex gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-4">
          <div className="grid gap-4 rounded-3xl border border-line bg-surface p-4 sm:grid-cols-2">
            <Field label="Page title" htmlFor="title" errors={state?.fieldErrors?.title}>
              <Input id="title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </Field>
            <Field label="Page type" htmlFor="pageType" errors={state?.fieldErrors?.pageType}>
              <Select id="pageType" name="pageType" value={pageType} onChange={(event) => setPageType(event.target.value)}>
                {WIKI_PAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {mode === "visual" ? (
            <>
              <RichTextScratchPad onInsert={appendBlocks} />
              {hasReferences ? (
                <p className="rounded-2xl border border-osc-star/40 bg-osc-star/10 px-4 py-3 text-sm font-bold text-osc-star">
                  This page has references but no references list. Insert the References template before saving.
                </p>
              ) : null}
              <section className="space-y-3">
                {document.blocks.map((block, index) => (
                  <VisualBlockEditor
                    key={index}
                    block={block}
                    index={index}
                    total={document.blocks.length}
                    onReplace={(next) => replaceBlock(index, next)}
                    onRemove={() => removeBlock(index)}
                    onMove={moveBlock}
                  />
                ))}
              </section>
            </>
          ) : null}

          {mode === "source" ? (
            <Field label="Wikitext source" htmlFor="source" errors={state?.fieldErrors?.contentWikitext}>
              <Textarea
                id="source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="min-h-[620px] font-mono text-sm"
              />
            </Field>
          ) : null}

          {mode === "preview" ? (
            <article
              className="wiki-content rounded-3xl border border-line bg-surface p-5"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          ) : null}
        </main>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl text-cream">Page settings</h2>
            <div className="mt-4 space-y-4">
              <Field label="Related show" htmlFor="relatedShowId">
                <Select id="relatedShowId" name="relatedShowId" value={relatedShowId} onChange={(event) => setRelatedShowId(event.target.value)}>
                  <option value="">None</option>
                  {shows.map((show) => (
                    <option key={show.id} value={show.id}>
                      {show.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Main image URL" htmlFor="mainImageUrl" errors={state?.fieldErrors?.mainImageUrl}>
                <Input
                  id="mainImageUrl"
                  name="mainImageUrl"
                  value={mainImageUrl}
                  onChange={(event) => setMainImageUrl(event.target.value)}
                  placeholder="https://example.com/image.png"
                />
              </Field>
              <Field label="Categories" htmlFor="categoryText" hint="comma-separated">
                <Input
                  id="categoryText"
                  value={categoryText}
                  onChange={(event) => setCategoryText(event.target.value)}
                  list="wiki-category-options"
                />
                <datalist id="wiki-category-options">
                  {categoryNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Quality template" htmlFor="qualityTemplate">
                <Select
                  id="qualityTemplate"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) {
                      appendBlocks([newBlockForTemplate(event.target.value as WikiTemplateKind)]);
                      event.target.value = "";
                    }
                  }}
                >
                  <option value="">Add one...</option>
                  {WIKI_TEMPLATE_KINDS.filter((kind) => !kind.startsWith("Infobox") && kind !== "Navbox show").map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm font-bold text-cream/80">
                <input
                  type="checkbox"
                  checked={document.blocks.some((block) => block.type === "template" && block.kind === "Spoilers")}
                  onChange={(event) => {
                    if (event.target.checked) appendBlocks([{ type: "template", kind: "Spoilers" }]);
                    else setDocument((current) => ({
                      ...current,
                      blocks: current.blocks.filter((block) => !(block.type === "template" && block.kind === "Spoilers")),
                    }));
                  }}
                />
                Spoiler notice
              </label>
              {isAdmin ? (
                <div className="space-y-2 rounded-2xl border border-line bg-night/25 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-cream/45">Admin</p>
                  <label className="flex items-center gap-2 text-sm font-bold text-cream/80">
                    <input type="checkbox" checked={isProtected} onChange={(event) => setIsProtected(event.target.checked)} />
                    Protected page
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-cream/80">
                    <input type="checkbox" checked={isHidden} onChange={(event) => setIsHidden(event.target.checked)} />
                    Hidden page
                  </label>
                </div>
              ) : null}
              <Field label="Edit summary" htmlFor="editSummary">
                <Input
                  id="editSummary"
                  name="editSummary"
                  value={editSummary}
                  onChange={(event) => setEditSummary(event.target.value)}
                  placeholder="What changed?"
                />
              </Field>
            </div>
          </section>
          <section className="rounded-3xl border border-line bg-surface p-4">
            <h2 className="font-display text-xl text-cream">Save status</h2>
            <p className="mt-2 text-sm text-cream/60">
              Drafts save locally in this browser. Saving publishes safe wikitext through the server renderer.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => switchMode("preview")}>
                Preview
              </Button>
              <Button type="submit" variant="accent" size="sm" disabled={pending}>
                {pending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {activeInsert ? (
        <InsertModal
          kind={activeInsert}
          draft={insertDraft}
          title={title}
          onChange={(key, value) => setInsertDraft((current) => ({ ...current, [key]: value }))}
          wikiPageTitles={wikiPageTitles}
          onClose={() => setActiveInsert(null)}
          onConfirm={confirmInsert}
        />
      ) : null}

      <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface/95 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur">
        <p className="text-sm text-cream/55">Local draft saved automatically in this browser.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => switchMode("preview")}>
            Preview
          </Button>
          <ButtonLink href={currentSlug ? `/wiki/${currentSlug}` : "/wiki"} variant="outline" size="sm">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="accent" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function InsertModal({
  kind,
  draft,
  title,
  onChange,
  wikiPageTitles,
  onClose,
  onConfirm,
}: {
  kind: Exclude<InsertKind, null>;
  draft: Record<string, string>;
  title: string;
  onChange: (key: string, value: string) => void;
  wikiPageTitles: string[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const internalLinkExists =
    !draft.target ||
    wikiPageTitles.some((pageTitle) => pageTitle.toLowerCase() === draft.target.toLowerCase());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl text-cream">Insert {kind.replace(/([A-Z])/g, " $1").toLowerCase()}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-cream/60 hover:bg-white/10 hover:text-cream" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {kind === "internalLink" ? (
            <>
              <Field label="Page title" htmlFor="insert-target">
                <Input
                  id="insert-target"
                  value={draft.target ?? ""}
                  onChange={(event) => onChange("target", event.target.value)}
                  list="wiki-page-title-options"
                />
                <datalist id="wiki-page-title-options">
                  {wikiPageTitles.map((pageTitle) => (
                    <option key={pageTitle} value={pageTitle} />
                  ))}
                </datalist>
              </Field>
              {!internalLinkExists ? (
                <p className="text-sm text-osc-star">That page does not exist yet; the link will still be saved.</p>
              ) : null}
              <Field label="Display text" htmlFor="insert-label">
                <Input id="insert-label" value={draft.label ?? ""} onChange={(event) => onChange("label", event.target.value)} />
              </Field>
            </>
          ) : null}
          {kind === "externalLink" ? (
            <>
              <Field label="URL" htmlFor="insert-url" hint="http or https only">
                <Input id="insert-url" value={draft.url ?? ""} onChange={(event) => onChange("url", event.target.value)} placeholder="https://example.com" />
              </Field>
              <Field label="Display text" htmlFor="insert-label">
                <Input id="insert-label" value={draft.label ?? ""} onChange={(event) => onChange("label", event.target.value)} />
              </Field>
              {draft.url && !safeExternalHref(draft.url) ? <p className="text-sm text-osc-red">Unsafe or malformed URL.</p> : null}
            </>
          ) : null}
          {kind === "image" ? (
            <>
              <Field label="Image URL" htmlFor="insert-image-url" hint="external image URL only">
                <Input id="insert-image-url" value={draft.url ?? ""} onChange={(event) => onChange("url", event.target.value)} placeholder="https://example.com/image.png" />
              </Field>
              <Field label="Caption" htmlFor="insert-caption">
                <Input id="insert-caption" value={draft.caption ?? ""} onChange={(event) => onChange("caption", event.target.value)} />
              </Field>
              <Field label="Alt text" htmlFor="insert-alt">
                <Input id="insert-alt" value={draft.alt ?? ""} onChange={(event) => onChange("alt", event.target.value)} />
              </Field>
              <Field label="Display style" htmlFor="insert-style">
                <Select id="insert-style" value={draft.style ?? "thumb"} onChange={(event) => onChange("style", event.target.value)}>
                  <option value="thumb">Thumbnail</option>
                  <option value="full">Full width</option>
                  <option value="right">Right aligned</option>
                  <option value="left">Left aligned</option>
                </Select>
              </Field>
              {draft.url && !safeExternalImageUrl(draft.url) ? <p className="text-sm text-osc-red">Only safe external image URLs are allowed.</p> : null}
            </>
          ) : null}
          {kind === "youtube" || kind === "vimeo" ? (
            <>
              <Field label={kind === "youtube" ? "YouTube URL or ID" : "Vimeo URL or ID"} htmlFor="insert-video">
                <Input id="insert-video" value={draft.video ?? ""} onChange={(event) => onChange("video", event.target.value)} />
              </Field>
              <Field label="Caption" htmlFor="insert-caption">
                <Input id="insert-caption" value={draft.caption ?? ""} onChange={(event) => onChange("caption", event.target.value)} />
              </Field>
            </>
          ) : null}
          {kind === "table" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rows" htmlFor="insert-rows">
                <Input id="insert-rows" type="number" min={1} max={20} value={draft.rows ?? "3"} onChange={(event) => onChange("rows", event.target.value)} />
              </Field>
              <Field label="Columns" htmlFor="insert-cols">
                <Input id="insert-cols" type="number" min={1} max={8} value={draft.cols ?? "3"} onChange={(event) => onChange("cols", event.target.value)} />
              </Field>
            </div>
          ) : null}
          {kind === "infobox" ? (
            <>
              <Field label="Infobox type" htmlFor="insert-infobox-type">
                <Select id="insert-infobox-type" value={draft.infoboxType ?? "show"} onChange={(event) => onChange("infoboxType", event.target.value)}>
                  <option value="show">Show</option>
                  <option value="character">Character</option>
                  <option value="episode">Episode</option>
                  <option value="season">Season</option>
                  <option value="creator">Creator</option>
                  <option value="upcoming show">Upcoming Show</option>
                </Select>
              </Field>
              <Field label="Title/name" htmlFor="insert-title">
                <Input id="insert-title" value={draft.title ?? title} onChange={(event) => onChange("title", event.target.value)} />
              </Field>
              <Field label="Image URL" htmlFor="insert-image">
                <Input id="insert-image" value={draft.image ?? ""} onChange={(event) => onChange("image", event.target.value)} />
              </Field>
              <Field label="Status/role" htmlFor="insert-status">
                <Input id="insert-status" value={draft.status ?? ""} onChange={(event) => onChange("status", event.target.value)} />
              </Field>
            </>
          ) : null}
          {kind === "template" ? (
            <Field label="Template" htmlFor="insert-template">
              <Select id="insert-template" value={draft.kind ?? "Stub"} onChange={(event) => onChange("kind", event.target.value)}>
                {BUILT_IN_WIKI_TEMPLATES.map((template) => (
                  <option key={template.kind} value={template.kind}>
                    {template.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {kind === "reference" ? (
            <>
              <Field label="Source text" htmlFor="insert-ref-text">
                <Textarea id="insert-ref-text" value={draft.text ?? ""} onChange={(event) => onChange("text", event.target.value)} />
              </Field>
              <Field label="Source URL" htmlFor="insert-ref-url">
                <Input id="insert-ref-url" value={draft.url ?? ""} onChange={(event) => onChange("url", event.target.value)} />
              </Field>
              <Field label="Source title" htmlFor="insert-ref-title">
                <Input id="insert-ref-title" value={draft.title ?? ""} onChange={(event) => onChange("title", event.target.value)} />
              </Field>
            </>
          ) : null}
          {kind === "navbox" ? (
            <>
              <Field label="Navbox title" htmlFor="insert-nav-title">
                <Input id="insert-nav-title" value={draft.title ?? title} onChange={(event) => onChange("title", event.target.value)} />
              </Field>
              <Field label="Links" htmlFor="insert-nav-links" hint="one per line, target|label optional">
                <Textarea id="insert-nav-links" value={draft.links ?? ""} onChange={(event) => onChange("links", event.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={onConfirm}>
            <Plus className="h-4 w-4" />
            Insert
          </Button>
        </div>
      </div>
    </div>
  );
}

function VisualBlockEditor({
  block,
  index,
  total,
  onReplace,
  onRemove,
  onMove,
}: {
  block: VisualWikiBlock;
  index: number;
  total: number;
  onReplace: (block: VisualWikiBlock) => void;
  onRemove: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const previewText = blockToWikitext(block);
  return (
    <article className="rounded-3xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cream/40">Block {index + 1}</p>
          <h3 className="font-display text-xl capitalize text-cream">{block.type.replace(/([A-Z])/g, " $1")}</h3>
        </div>
        <div className="flex gap-1">
          <ToolbarButton label="Move up" icon={ArrowUp} onClick={() => onMove(index, -1)} active={index === 0} />
          <ToolbarButton label="Move down" icon={ArrowDown} onClick={() => onMove(index, 1)} active={index === total - 1} />
          <ToolbarButton label="Remove block" icon={Trash2} onClick={onRemove} />
        </div>
      </div>

      <div className="space-y-3">
        {block.type === "paragraph" ? (
          <Textarea value={block.text} onChange={(event) => onReplace({ ...block, text: event.target.value })} />
        ) : null}
        {block.type === "heading" ? (
          <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Select value={block.level} onChange={(event) => onReplace({ ...block, level: Number(event.target.value) as 1 | 2 | 3 })}>
              <option value={1}>Heading 1</option>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </Select>
            <Input value={block.text} onChange={(event) => onReplace({ ...block, text: event.target.value })} />
          </div>
        ) : null}
        {block.type === "bulletList" || block.type === "numberedList" ? (
          <Textarea
            value={block.items.join("\n")}
            onChange={(event) => onReplace({ ...block, items: splitLines(event.target.value) })}
            placeholder="One item per line"
          />
        ) : null}
        {block.type === "quote" ? (
          <Textarea value={block.text} onChange={(event) => onReplace({ ...block, text: event.target.value })} />
        ) : null}
        {block.type === "internalLink" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={block.target} onChange={(event) => onReplace({ ...block, target: event.target.value })} placeholder="Page title" />
            <Input value={block.label ?? ""} onChange={(event) => onReplace({ ...block, label: event.target.value })} placeholder="Display text" />
          </div>
        ) : null}
        {block.type === "externalLink" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={block.url} onChange={(event) => onReplace({ ...block, url: event.target.value })} placeholder="https://..." />
            <Input value={block.label ?? ""} onChange={(event) => onReplace({ ...block, label: event.target.value })} placeholder="Display text" />
          </div>
        ) : null}
        {block.type === "imageEmbed" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={block.url} onChange={(event) => onReplace({ ...block, url: event.target.value })} placeholder="https://example.com/image.png" />
            <Input value={block.caption ?? ""} onChange={(event) => onReplace({ ...block, caption: event.target.value })} placeholder="Caption" />
            <Input value={block.alt ?? ""} onChange={(event) => onReplace({ ...block, alt: event.target.value })} placeholder="Alt text" />
            <Select value={block.style} onChange={(event) => onReplace({ ...block, style: event.target.value as "thumb" | "full" | "right" | "left" })}>
              <option value="thumb">Thumbnail</option>
              <option value="full">Full width</option>
              <option value="right">Right aligned</option>
              <option value="left">Left aligned</option>
            </Select>
          </div>
        ) : null}
        {block.type === "youtubeEmbed" || block.type === "vimeoEmbed" ? (
          <Input value={block.videoId} onChange={(event) => onReplace({ ...block, videoId: event.target.value })} placeholder="Video URL or ID" />
        ) : null}
        {block.type === "infobox" ? (
          <InfoboxEditor block={block} onReplace={onReplace} />
        ) : null}
        {block.type === "table" ? (
          <TableEditor block={block} onReplace={onReplace} />
        ) : null}
        {block.type === "template" ? (
          <Select value={block.kind} onChange={(event) => onReplace(newBlockForTemplate(event.target.value as WikiTemplateKind))}>
            {BUILT_IN_WIKI_TEMPLATES.map((template) => (
              <option key={template.kind} value={template.kind}>
                {template.label}
              </option>
            ))}
          </Select>
        ) : null}
        {block.type === "reference" ? (
          <div className="grid gap-3">
            <Textarea value={block.text} onChange={(event) => onReplace({ ...block, text: event.target.value })} placeholder="Source text" />
            <Input value={block.url ?? ""} onChange={(event) => onReplace({ ...block, url: event.target.value })} placeholder="Source URL" />
            <Input value={block.title ?? ""} onChange={(event) => onReplace({ ...block, title: event.target.value })} placeholder="Source title" />
          </div>
        ) : null}
        {block.type === "referencesList" ? (
          <p className="rounded-2xl border border-line bg-night/25 px-3 py-2 text-sm text-cream/60">References list block.</p>
        ) : null}
        {block.type === "navbox" ? (
          <div className="grid gap-3">
            <Input value={block.title} onChange={(event) => onReplace({ ...block, title: event.target.value })} placeholder="Navbox title" />
            <Textarea
              value={block.links.map((link) => `${link.target}${link.label ? `|${link.label}` : ""}`).join("\n")}
              onChange={(event) =>
                onReplace({
                  ...block,
                  links: splitLines(event.target.value).map((line) => {
                    const [target, label] = line.split("|").map((part) => part.trim());
                    return { target, ...(label ? { label } : {}) };
                  }),
                })
              }
              placeholder="Characters|Characters page"
            />
          </div>
        ) : null}
        {block.type === "raw" ? (
          <div className="space-y-2">
            <p className="rounded-2xl border border-osc-star/40 bg-osc-star/10 px-3 py-2 text-sm text-osc-star">
              This section contains advanced wikitext. It will be preserved on save.
            </p>
            <Textarea value={block.wikitext} onChange={(event) => onReplace({ ...block, wikitext: event.target.value })} className="font-mono text-sm" />
          </div>
        ) : null}
      </div>

      {previewText ? (
        <details className="mt-3 text-xs text-cream/45">
          <summary className="cursor-pointer font-bold text-cream/60">Generated wikitext</summary>
          <pre className="mt-2 overflow-x-auto rounded-2xl bg-night/45 p-3">{previewText}</pre>
        </details>
      ) : null}
    </article>
  );
}

function InfoboxEditor({
  block,
  onReplace,
}: {
  block: WikiInfoboxBlock;
  onReplace: (block: VisualWikiBlock) => void;
}) {
  const entries = Object.entries(block.fields);
  return (
    <div className="space-y-3">
      <Select
        value={block.infoboxType}
        onChange={(event) => onReplace({ ...block, infoboxType: event.target.value as WikiInfoboxBlock["infoboxType"] })}
      >
        <option value="show">Show</option>
        <option value="character">Character</option>
        <option value="episode">Episode</option>
        <option value="season">Season</option>
        <option value="creator">Creator</option>
        <option value="upcoming show">Upcoming Show</option>
      </Select>
      {entries.map(([key, value]) => (
        <div key={key} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
          <Input
            value={key}
            onChange={(event) => {
              const next = { ...block.fields };
              delete next[key];
              next[event.target.value.trim().replace(/\s+/g, "_") || key] = value;
              onReplace({ ...block, fields: next });
            }}
          />
          <Input
            value={value}
            onChange={(event) => onReplace({ ...block, fields: { ...block.fields, [key]: event.target.value } })}
          />
          <button
            type="button"
            className="rounded-xl border border-line px-3 text-cream/60 hover:text-osc-red"
            onClick={() => {
              const next = { ...block.fields };
              delete next[key];
              onReplace({ ...block, fields: next });
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onReplace({ ...block, fields: { ...block.fields, field: "" } })}
      >
        Add field
      </Button>
    </div>
  );
}

function TableEditor({
  block,
  onReplace,
}: {
  block: Extract<VisualWikiBlock, { type: "table" }>;
  onReplace: (block: VisualWikiBlock) => void;
}) {
  const rows = block.rows.length ? block.rows : [["Header"], ["Cell"]];
  const cols = Math.max(...rows.map((row) => row.length));
  function updateCell(rowIndex: number, colIndex: number, value: string) {
    const next = rows.map((row) => [...row]);
    next[rowIndex][colIndex] = value;
    onReplace({ ...block, rows: next });
  }
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-bold text-cream/80">
        <input type="checkbox" checked={block.headerRow} onChange={(event) => onReplace({ ...block, headerRow: event.target.checked })} />
        Mark first row as header
      </label>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: cols }, (_, colIndex) => (
                  <td key={colIndex} className="border border-line p-1">
                    <Input value={row[colIndex] ?? ""} onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onReplace({ ...block, rows: [...rows, Array.from({ length: cols }, () => "")] })}>
          Add row
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onReplace({ ...block, rows: rows.map((row) => [...row, ""]) })}>
          Add column
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onReplace({ ...block, rows: rows.length > 1 ? rows.slice(0, -1) : rows })}>
          Remove row
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onReplace({ ...block, rows: rows.map((row) => (row.length > 1 ? row.slice(0, -1) : row)) })}>
          Remove column
        </Button>
      </div>
    </div>
  );
}
