import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/format";
import { WikiRevisionRestoreButton } from "@/components/wiki/wiki-admin-actions";

export const metadata: Metadata = { title: "Wiki History" };

export default async function WikiHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      revisions: {
        orderBy: { createdAt: "desc" },
        include: { editor: { select: { username: true } } },
      },
    },
  });
  if (!page || (page.isHidden && !user?.isAdmin)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl text-cream">History: {page.title}</h1>
        <Link href={`/wiki/${page.slug}`} className="text-sm font-bold text-osc-blue hover:underline">
          Back to page
        </Link>
      </div>
      <ol className="space-y-3">
        {page.revisions.map((revision, index) => (
          <li key={revision.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-cream/50">
              <span className="font-bold text-cream/80">{formatDate(revision.createdAt)}</span>
              <span>
                by{" "}
                {revision.editor ? (
                  <Link href={`/profile/${revision.editor.username}`} className="font-bold text-cream/80 hover:text-osc-blue">
                    @{revision.editor.username}
                  </Link>
                ) : (
                  "unknown"
                )}
              </span>
              {revision.editSummary ? <span>{revision.editSummary}</span> : null}
              <span className="ml-auto">
                {index === 0 ? (
                  <span className="rounded-full bg-osc-green/15 px-2.5 py-1 text-xs font-bold text-osc-green">
                    current
                  </span>
                ) : user?.isAdmin ? (
                  <WikiRevisionRestoreButton revisionId={revision.id} />
                ) : null}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-cream/45">
              {revision.contentWikitext}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
