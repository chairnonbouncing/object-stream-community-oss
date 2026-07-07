import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveThumbnail } from "@/lib/video-url";
import { formatDate } from "@/lib/format";
import { AdminVideoActions } from "@/components/admin/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Videos" };

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; hidden?: string; featured?: string }>;
}) {
  await requireAdmin();
  const { q, hidden, featured } = await searchParams;

  const videos = await prisma.video.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { showTitle: { contains: q } },
              { episodeTitle: { contains: q } },
              { providerVideoId: { contains: q } },
            ],
          }
        : {}),
      ...(hidden === "1" ? { isHidden: true } : {}),
      ...(featured === "1" ? { isFeatured: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { submittedBy: { select: { username: true } } },
  });

  return (
    <div className="space-y-4">
      <form action="/admin/videos" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title, show, or video ID…"
          className="w-full max-w-sm rounded-full border border-line bg-surface px-4 py-2 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none"
        />
      </form>

      {videos.length === 0 ? (
        <EmptyState emoji="📭" title="No videos match" />
      ) : (
        <ul className="space-y-2">
          {videos.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              <img
                src={resolveThumbnail(v)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-12 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/watch/${v.id}`}
                  className="block truncate text-sm font-bold text-cream hover:text-osc-blue"
                >
                  {v.episodeTitle ?? v.showTitle}
                </Link>
                <p className="truncate text-xs text-cream/50">
                  {v.showTitle} · {v.provider} · added {formatDate(v.createdAt)}
                  {v.submittedBy ? ` by @${v.submittedBy.username}` : ""}
                  {v.channelTitle ? ` · ${v.channelTitle}` : ""}
                  {v.reportCount > 0 ? (
                    <span className="ml-1 font-bold text-osc-red">
                      ⚑ {v.reportCount} report{v.reportCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge color="yellow">{v.ageRangeTag}</Badge>
                  <Badge color="neutral">{v.language}</Badge>
                  <Badge color="blue">{v.status}</Badge>
                </div>
              </div>
              <Link
                href={`/admin/videos/${v.id}`}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-cream/60 hover:border-osc-blue/60 hover:text-osc-blue"
              >
                ✎ Edit
              </Link>
              <AdminVideoActions
                videoId={v.id}
                isHidden={v.isHidden}
                isFeatured={v.isFeatured}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
