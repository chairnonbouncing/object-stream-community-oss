import Link from "next/link";
import { cn } from "@/lib/cn";

function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  if (page > 1) qs.set("page", String(page));
  else qs.delete("page");
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function Pagination({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const linkClasses =
    "rounded-full border border-line px-4 py-1.5 text-sm font-bold text-cream/80 hover:bg-white/10";
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={pageHref(basePath, params, page - 1)} className={linkClasses}>
          ← Prev
        </Link>
      ) : (
        <span className={cn(linkClasses, "pointer-events-none opacity-40")}>← Prev</span>
      )}
      <span className="text-sm text-cream/60">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={pageHref(basePath, params, page + 1)} className={linkClasses}>
          Next →
        </Link>
      ) : (
        <span className={cn(linkClasses, "pointer-events-none opacity-40")}>Next →</span>
      )}
    </nav>
  );
}
