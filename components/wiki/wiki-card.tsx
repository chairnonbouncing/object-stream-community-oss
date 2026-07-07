import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCount, formatDate } from "@/lib/format";
import { cleanWikiSummary } from "@/lib/wiki-toc";
import type { WikiSearchResult } from "@/lib/queries/wiki";

const TYPE_EMOJI: Record<string, string> = {
  Show: "📺",
  "Upcoming Show": "🔜",
  Episode: "🎬",
  Character: "🧍",
  Creator: "🎨",
  Lore: "📜",
  Other: "📚",
};

export function WikiCard({
  page,
  compact = false,
  className,
}: {
  page: WikiSearchResult;
  /** Smaller layout for search-result strips. */
  compact?: boolean;
  className?: string;
}) {
  const summary = cleanWikiSummary(page.summary);
  return (
    <Link
      href={`/wiki/${page.slug}`}
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:border-osc-blue/60 hover:shadow-lg hover:shadow-osc-blue/10",
        className
      )}
    >
      {page.mainImageUrl ? (
        <img
          src={page.mainImageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "shrink-0 rounded-xl object-cover",
            compact ? "h-14 w-20" : "h-20 w-28"
          )}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-osc-purple-deep/50",
            compact ? "h-14 w-20 text-2xl" : "h-20 w-28 text-3xl"
          )}
          aria-hidden
        >
          {TYPE_EMOJI[page.pageType] ?? "📚"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge color={page.pageType === "Show" ? "purple" : "blue"}>
            {page.pageType}
          </Badge>
          {page.isProtected ? <Badge color="yellow">Protected</Badge> : null}
          {page.isHidden ? <Badge color="red">Hidden</Badge> : null}
        </span>
        <span
          className={cn(
            "mt-1 block truncate font-display text-cream",
            compact ? "text-lg" : "text-2xl"
          )}
        >
          {page.title}
        </span>
        {summary ? (
          <span
            className={cn(
              "block text-sm text-cream/60",
              compact ? "line-clamp-1" : "line-clamp-2"
            )}
          >
            {summary}
          </span>
        ) : null}
        {!compact ? (
          <span className="mt-1 block text-xs text-cream/40">
            Last edited{" "}
            {page.lastEditedAt ? formatDate(page.lastEditedAt) : "by the community"}
          </span>
        ) : null}
        <span className="mt-1 block text-[10px] text-cream/35">
          {formatCount(page.viewCount)} views · {formatCount(page.editCount)} edits ·{" "}
          {formatCount(page.watcherCount)} watchers
        </span>
      </span>
    </Link>
  );
}
