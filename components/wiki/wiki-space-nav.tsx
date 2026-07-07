import Link from "next/link";
import { cn } from "@/lib/cn";
import type { WikiSpace } from "@/lib/queries/wiki";

/** In-wiki navigation: every page of a show's wiki, one click apart. */
export function WikiSpaceNav({
  space,
  currentPageId,
}: {
  space: WikiSpace;
  currentPageId: string;
}) {
  return (
    <nav
      className="hide-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      aria-label={`${space.show.title} wiki pages`}
    >
      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-cream/40">
        📚 {space.show.title} wiki:
      </span>
      {space.pages.map((page) => {
        const current = page.id === currentPageId;
        return (
          <Link
            key={page.id}
            href={`/wiki/${page.slug}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1 text-xs font-bold transition",
              current
                ? "border-osc-purple bg-osc-purple/25 text-cream"
                : "border-line text-cream/70 hover:border-osc-purple/60 hover:text-cream"
            )}
            title={page.pageType}
          >
            {page.title}
          </Link>
        );
      })}
      <Link
        href={`/wiki/new/edit?show=${space.show.id}`}
        className="shrink-0 whitespace-nowrap rounded-full border-2 border-dashed border-osc-green/50 px-3 py-1 text-xs font-bold text-osc-green transition hover:bg-osc-green/10"
      >
        ＋ New page
      </Link>
    </nav>
  );
}
