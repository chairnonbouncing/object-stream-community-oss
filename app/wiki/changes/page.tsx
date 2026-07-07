import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Recent wiki changes" };

export default async function WikiChangesPage() {
  const user = await getSessionUser();
  const revisions = await prisma.wikiRevision.findMany({
    where: user?.isAdmin ? {} : { wikiPage: { isHidden: false } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      editSummary: true,
      createdAt: true,
      editor: { select: { username: true } },
      wikiPage: { select: { slug: true, title: true, pageType: true } },
    },
  });

  // Group by calendar day so the feed reads like a changelog.
  const byDay = new Map<string, typeof revisions>();
  for (const rev of revisions) {
    const day = formatDate(rev.createdAt);
    const list = byDay.get(day) ?? [];
    list.push(rev);
    byDay.set(day, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">Recent changes</h1>
        <p className="mt-1 text-sm text-cream/60">
          Every wiki edit across the site, newest first.{" "}
          <Link href="/wiki" className="font-bold text-osc-blue hover:underline">
            Back to the wiki
          </Link>
        </p>
      </div>

      {revisions.length === 0 ? (
        <EmptyState
          emoji="📝"
          title="No edits yet"
          hint="Wiki edits will show up here as they happen."
        />
      ) : (
        [...byDay.entries()].map(([day, revs]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-cream/40">
              {day}
            </h2>
            <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {revs.map((rev) => (
                <li key={rev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <Link
                    href={`/wiki/${rev.wikiPage.slug}`}
                    className="font-bold text-osc-blue hover:underline"
                  >
                    {rev.wikiPage.title}
                  </Link>
                  <Badge color={rev.wikiPage.pageType === "Show" ? "purple" : "blue"}>
                    {rev.wikiPage.pageType}
                  </Badge>
                  <span className="text-cream/60">
                    {rev.editSummary || "edited"}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-cream/40">
                    {rev.editor ? (
                      <Link
                        href={`/profile/${rev.editor.username}`}
                        className="hover:text-osc-blue"
                      >
                        @{rev.editor.username}
                      </Link>
                    ) : (
                      "system"
                    )}{" "}
                    ·{" "}
                    {rev.createdAt.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link
                    href={`/wiki/${rev.wikiPage.slug}/history`}
                    className="shrink-0 text-xs font-bold text-cream/35 hover:text-osc-blue"
                  >
                    history
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
