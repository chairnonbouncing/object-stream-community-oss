import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatCount, formatHoursFromSeconds } from "@/lib/format";
import { StarDisplay } from "@/components/video/star-display";
import type { ShowSummary } from "@/lib/queries/shows";

export function ShowCard({
  show,
  className,
}: {
  show: ShowSummary;
  className?: string;
}) {
  return (
    <Link
      href={`/shows/${show.showSlug}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-osc-blue/60 hover:shadow-lg hover:shadow-osc-blue/10",
        className
      )}
    >
      <div className="aspect-video overflow-hidden bg-surface-2">
        <img
          src={show.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate font-display text-base text-cream" title={show.showTitle}>
          {show.showTitle}
        </p>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
          <span className="rounded-full border border-osc-star/70 px-2 py-0.5 text-osc-star">
            {show.ageRangeTag}
          </span>
          {show.isUpcoming ? (
            <span className="rounded-full border border-osc-blue/70 px-2 py-0.5 text-osc-blue">
              Upcoming
            </span>
          ) : show.status !== "Ongoing" ? (
            <span className="rounded-full border border-osc-green/70 px-2 py-0.5 text-osc-green">
              {show.status}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <StarDisplay avg={show.avgRating} count={show.ratingCount || undefined} />
          <span className="text-[11px] font-bold text-osc-blue">
            {show.episodeCount} ep{show.episodeCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-cream/35">
          <span>{formatCount(show.viewCount)} views</span>
          <span>{formatCount(show.totalMarkedWatchedCount)} watched</span>
          <span>{formatHoursFromSeconds(show.estimatedSecondsWatched)}</span>
          <span>{formatCount(show.followerCount)} followers</span>
        </div>
      </div>
    </Link>
  );
}
