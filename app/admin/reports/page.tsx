import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  AdminReportActions,
  AdminReviewActions,
  AdminVideoActions,
} from "@/components/admin/row-actions";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin · Reports" };

export default async function AdminReportsPage() {
  await requireAdmin();

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { reporter: { select: { username: true } } },
  });

  const videoIds = reports.filter((r) => r.targetType === "video").map((r) => r.targetId);
  const reviewIds = reports
    .filter((r) => r.targetType === "review")
    .map((r) => r.targetId);
  const wikiPageIds = reports
    .filter((r) => r.targetType === "wiki_page" || r.targetType === "wiki_image")
    .map((r) => r.targetId);
  const wikiDiscussionIds = reports
    .filter((r) => r.targetType === "wiki_discussion")
    .map((r) => r.targetId);

  const [videos, reviews, wikiPages, wikiDiscussions] = await Promise.all([
    prisma.video.findMany({
      where: { id: { in: videoIds } },
      select: {
        id: true,
        showTitle: true,
        episodeTitle: true,
        isHidden: true,
        isFeatured: true,
      },
    }),
    prisma.review.findMany({
      where: { id: { in: reviewIds } },
      select: {
        id: true,
        text: true,
        isHidden: true,
        user: { select: { username: true } },
        video: { select: { id: true } },
      },
    }),
    prisma.wikiPage.findMany({
      where: { id: { in: wikiPageIds } },
      select: { id: true, slug: true, title: true, isHidden: true, isProtected: true },
    }),
    prisma.wikiDiscussion.findMany({
      where: { id: { in: wikiDiscussionIds } },
      select: {
        id: true,
        text: true,
        isHidden: true,
        user: { select: { username: true } },
        wikiPage: { select: { slug: true, title: true } },
      },
    }),
  ]);
  const videoById = new Map(videos.map((v) => [v.id, v]));
  const reviewById = new Map(reviews.map((r) => [r.id, r]));
  const wikiPageById = new Map(wikiPages.map((p) => [p.id, p]));
  const wikiDiscussionById = new Map(wikiDiscussions.map((d) => [d.id, d]));

  return (
    <div className="space-y-4">
      {reports.length === 0 ? (
        <EmptyState
          emoji="🎉"
          title="No open reports"
          hint="The community is behaving itself. For now."
        />
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => {
            const video =
              report.targetType === "video" ? videoById.get(report.targetId) : null;
            const review =
              report.targetType === "review" ? reviewById.get(report.targetId) : null;
            const wikiPage =
              report.targetType === "wiki_page" || report.targetType === "wiki_image"
                ? wikiPageById.get(report.targetId)
                : null;
            const wikiDiscussion =
              report.targetType === "wiki_discussion"
                ? wikiDiscussionById.get(report.targetId)
                : null;
            const targetGone = !video && !review && !wikiPage && !wikiDiscussion;

            return (
              <li key={report.id} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cream/50">
                  <span className="rounded-full bg-osc-red/15 px-2 py-0.5 font-bold uppercase text-osc-red">
                    {report.targetType}
                  </span>
                  <span>
                    reported by <b className="text-cream">@{report.reporter.username}</b>
                  </span>
                  <span>{formatDate(report.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <AdminReportActions reportId={report.id} />
                    {video ? (
                      <AdminVideoActions
                        videoId={video.id}
                        isHidden={video.isHidden}
                        isFeatured={video.isFeatured}
                      />
                    ) : null}
                    {review ? (
                      <AdminReviewActions reviewId={review.id} isHidden={review.isHidden} />
                    ) : null}
                  </span>
                </div>

                {report.reason ? (
                  <p className="mt-1.5 text-sm italic text-cream/70">
                    “{report.reason}”
                  </p>
                ) : null}

                <div className="mt-1.5 text-sm text-cream/80">
                  {video ? (
                    <Link
                      href={`/watch/${video.id}`}
                      className="font-bold text-osc-blue hover:underline"
                    >
                      {video.episodeTitle ?? video.showTitle} →
                    </Link>
                  ) : review ? (
                    <p className="line-clamp-2">
                      <Link
                        href={`/watch/${review.video.id}`}
                        className="font-bold text-osc-blue hover:underline"
                      >
                        review by @{review.user.username}:
                      </Link>{" "}
                      {review.text}
                    </p>
                  ) : wikiPage ? (
                    <Link
                      href={`/wiki/${wikiPage.slug}`}
                      className="font-bold text-osc-blue hover:underline"
                    >
                      wiki page: {wikiPage.title} →
                    </Link>
                  ) : wikiDiscussion ? (
                    <p className="line-clamp-2">
                      <Link
                        href={`/wiki/${wikiDiscussion.wikiPage.slug}/discussion`}
                        className="font-bold text-osc-blue hover:underline"
                      >
                        wiki discussion on {wikiDiscussion.wikiPage.title} by @
                        {wikiDiscussion.user.username}:
                      </Link>{" "}
                      {wikiDiscussion.text}
                    </p>
                  ) : targetGone ? (
                    <span className="text-cream/40">
                      Target already deleted — dismiss this report.
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
