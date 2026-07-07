import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/format";
import { WikiDiscussionForm } from "@/components/wiki/wiki-discussion-form";
import { WikiDiscussionAdminAction } from "@/components/wiki/wiki-admin-actions";
import { ReportButton } from "@/components/shared/report-button";

export const metadata: Metadata = { title: "Wiki Discussion" };

export default async function WikiDiscussionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      discussions: {
        where: user?.isAdmin ? {} : { isHidden: false },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { username: true, avatarUrl: true } } },
      },
    },
  });
  if (!page || (page.isHidden && !user?.isAdmin)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl text-cream">Discussion: {page.title}</h1>
        <Link href={`/wiki/${page.slug}`} className="text-sm font-bold text-osc-blue hover:underline">
          Back to page
        </Link>
      </div>

      {user ? (
        <WikiDiscussionForm wikiPageId={page.id} slug={page.slug} />
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-cream/60">
          <Link href={`/signin?callbackUrl=/wiki/${page.slug}/discussion`} className="font-bold text-osc-blue hover:underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      <ol className="space-y-3">
        {page.discussions.map((discussion) => (
          <li key={discussion.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-cream/50">
              <Link href={`/profile/${discussion.user.username}`} className="font-bold text-cream/80 hover:text-osc-blue">
                @{discussion.user.username}
              </Link>
              <span>{formatDate(discussion.createdAt)}</span>
              {discussion.isHidden ? <span className="font-bold text-osc-red">hidden</span> : null}
              <span className="ml-auto flex gap-2">
                <ReportButton
                  targetType="wiki_discussion"
                  targetId={discussion.id}
                  signedIn={Boolean(user)}
                />
                {user?.isAdmin ? (
                  <WikiDiscussionAdminAction
                    discussionId={discussion.id}
                    isHidden={discussion.isHidden}
                  />
                ) : null}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-cream/75">{discussion.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
