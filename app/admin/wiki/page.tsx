import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { WikiPageAdminActions } from "@/components/wiki/wiki-admin-actions";

export const metadata: Metadata = { title: "Admin · Wiki" };

export default async function AdminWikiPage() {
  await requireAdmin();
  const pages = await prisma.wikiPage.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      lastEditedBy: { select: { username: true } },
      _count: { select: { revisions: true, discussions: true } },
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-cream">Wiki moderation</h2>
      <ul className="space-y-2">
        {pages.map((page) => (
          <li key={page.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={page.pageType === "Show" ? "purple" : "blue"}>{page.pageType}</Badge>
                  {page.isHidden ? <Badge color="red">Hidden</Badge> : null}
                  {page.isProtected ? <Badge color="yellow">Protected</Badge> : null}
                </div>
                <Link href={`/wiki/${page.slug}`} className="mt-2 block truncate font-bold text-cream hover:text-osc-blue">
                  {page.title}
                </Link>
                <p className="text-xs text-cream/50">
                  Updated {formatDate(page.updatedAt)}
                  {page.lastEditedBy ? ` by @${page.lastEditedBy.username}` : ""} ·{" "}
                  {page._count.revisions} revisions · {page._count.discussions} discussions
                </p>
              </div>
              <WikiPageAdminActions
                pageId={page.id}
                isHidden={page.isHidden}
                isProtected={page.isProtected}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
