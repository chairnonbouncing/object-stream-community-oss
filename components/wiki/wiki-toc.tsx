import type { WikiTocEntry } from "@/lib/wiki-toc";
import { cn } from "@/lib/cn";

/** MediaWiki-style collapsible table of contents, shown for 3+ headings. */
export function WikiToc({ toc }: { toc: WikiTocEntry[] }) {
  if (toc.length < 3) return null;
  return (
    <details
      open
      className="w-fit max-w-full rounded-2xl border border-line bg-surface-2/70 px-4 py-3"
    >
      <summary className="cursor-pointer select-none text-sm font-bold text-cream/80 hover:text-cream">
        Contents
      </summary>
      <ol className="mt-2 space-y-1 text-sm">
        {toc.map((entry, i) => (
          <li
            key={entry.id}
            className={cn(
              entry.level >= 4 ? "pl-8" : entry.level === 3 ? "pl-4" : undefined
            )}
          >
            <a
              href={`#${entry.id}`}
              className="text-osc-blue hover:underline"
            >
              <span className="mr-1.5 text-cream/35">{i + 1}.</span>
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}
