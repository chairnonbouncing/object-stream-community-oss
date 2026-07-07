import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { AdminReviewActions } from "@/components/admin/row-actions";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin · Reviews" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  await requireAdmin();
  const { hidden } = await searchParams;

  const reviews = await prisma.review.findMany({
    where: hidden === "1" ? { isHidden: true } : {},
    orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: { select: { username: true } },
      video: { select: { id: true, showTitle: true, episodeTitle: true } },
    },
  });

  return (
    <div className="space-y-4">
      {reviews.length === 0 ? (
        <EmptyState emoji="💬" title="No reviews here" />
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cream/50">
                <span className="font-bold text-cream">@{r.user.username}</span>
                {r.rating != null ? (
                  <span className="text-osc-star">{"★".repeat(r.rating)}</span>
                ) : null}
                <span>on</span>
                <Link
                  href={`/watch/${r.video.id}`}
                  className="font-bold text-osc-blue hover:underline"
                >
                  {r.video.episodeTitle ?? r.video.showTitle}
                </Link>
                <span>{formatDate(r.createdAt)}</span>
                {r.reportCount > 0 ? (
                  <span className="font-bold text-osc-red">
                    ⚑ {r.reportCount} report{r.reportCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {r.isHidden ? (
                  <span className="font-bold text-osc-red">hidden</span>
                ) : null}
                <span className="ml-auto">
                  <AdminReviewActions reviewId={r.id} isHidden={r.isHidden} />
                </span>
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-cream/80">
                {r.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
