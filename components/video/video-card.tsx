import Link from "next/link";
import { cn } from "@/lib/cn";
import { resolveThumbnail } from "@/lib/video-url";
import { episodeLabel, formatCount, formatHoursFromSeconds } from "@/lib/format";
import { StarDisplay } from "@/components/video/star-display";
import type { VideoWithRating } from "@/lib/queries/videos";

export function VideoCard({
  video,
  showShowTitle = true,
  className,
  watchParams,
}: {
  video: VideoWithRating;
  showShowTitle?: boolean;
  className?: string;
  /** Extra query string for the watch link, e.g. `list=abc`. */
  watchParams?: string;
}) {
  const label = episodeLabel(video);
  const title = video.episodeTitle ?? video.showTitle;

  return (
    <Link
      href={`/watch/${video.id}${watchParams ? `?${watchParams}` : ""}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-osc-purple/60 hover:shadow-lg hover:shadow-osc-purple/10",
        className
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        <img
          src={resolveThumbnail(video)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {video.provider === "youtube" ? "YouTube" : "Vimeo"}
        </span>
        {label ? (
          <span className="absolute left-2 top-2 rounded-full bg-osc-purple/90 px-2 py-0.5 text-[10px] font-bold text-white">
            {label}
          </span>
        ) : null}
        {"ageRangeTag" in video && video.ageRangeTag ? (
          <span className="absolute left-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white/90">
            {video.ageRangeTag}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-bold text-cream" title={title}>
          {title}
        </p>
        {showShowTitle ? (
          <p className="truncate text-xs text-cream/50">{video.showTitle}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <StarDisplay avg={video.avgRating} count={video.ratingCount || undefined} />
          <span
            className="truncate text-[11px] text-cream/40"
            title={`${formatCount(video.markedWatchedCount)} marked watched · ${formatHoursFromSeconds(video.estimatedSecondsWatched)} watched · in ${formatCount(video.playlistAddCount)} playlists`}
          >
            {formatCount(video.viewCount)} views
          </span>
        </div>
      </div>
    </Link>
  );
}
