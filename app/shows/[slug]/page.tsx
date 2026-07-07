import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { getShowDetail } from "@/lib/queries/shows";
import { formatCount, formatHoursFromSeconds } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { GenreChips } from "@/components/video/genre-chips";
import { StarDisplay } from "@/components/video/star-display";
import { VideoCard } from "@/components/video/video-card";
import { ButtonLink } from "@/components/ui/button";
import { FavoriteShowButton } from "@/components/shows/favorite-show-button";
import { PublicViewTracker } from "@/components/shared/public-view-tracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getShowDetail(slug);
  return { title: detail?.showTitle ?? "Show not found" };
}

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const show = await getShowDetail(slug, user?.id);
  if (!show) notFound();

  const statusColor = {
    Ongoing: "green",
    Completed: "blue",
    Hiatus: "yellow",
    Cancelled: "red",
    "One-shot": "purple",
  } as const;

  return (
    <div className="space-y-8">
      <PublicViewTracker kind="show" targetId={show.showId} />
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="font-display text-3xl text-cream sm:text-5xl">
              {show.showTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {show.statuses.map((s) => (
                <Badge
                  key={s}
                  color={statusColor[s as keyof typeof statusColor] ?? "neutral"}
                >
                  {s}
                </Badge>
              ))}
              <Badge color="yellow">{show.ageRangeTag}</Badge>
              {show.years.length > 0 ? (
                <span className="text-xs text-cream/50">
                  {show.years[0]}
                  {show.years.length > 1 ? `–${show.years[show.years.length - 1]}` : ""}
                </span>
              ) : null}
              <span className="text-xs text-cream/50">
                {show.languages.join(", ")}
              </span>
            </div>
            {show.description ? (
              <p className="max-w-3xl text-sm text-cream/65">{show.description}</p>
            ) : null}
            <GenreChips genreTags={show.genres.join(",")} />
            <div className="flex items-center gap-4 pt-1">
              <StarDisplay avg={show.avgRating} count={show.ratingCount} />
              <span className="text-xs text-cream/50">
                {show.videos.length} episode{show.videos.length === 1 ? "" : "s"} ·{" "}
                {formatCount(show.totalViews)} views
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
              {[
                ["Page views", formatCount(show.totalViews)],
                ["Marked watched", formatCount(show.totalMarkedWatchedCount)],
                ["Estimated watched", formatHoursFromSeconds(show.estimatedSecondsWatched)],
                ["Episodes", formatCount(show.videos.length)],
                ["Followers", formatCount(show.followerCount)],
                ["Reviews", formatCount(show.reviewCount)],
                ["Average rating", show.avgRating != null ? show.avgRating.toFixed(1) : "Not rated"],
                ["Wiki pages", formatCount(show.wikiPageCount)],
              ].map(([labelText, value]) => (
                <div key={labelText} className="rounded-2xl border border-line bg-night/30 px-3 py-2">
                  <p className="text-xs font-bold text-cream/45">{labelText}</p>
                  <p className="font-display text-lg text-cream">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ButtonLink href={`/watch/${show.videos[0].id}`} size="lg">
              Let&apos;s Watch!
            </ButtonLink>
            <ButtonLink href={`/shows/${show.showSlug}/wiki`} variant="ghost" size="lg">
              Wiki
            </ButtonLink>
            <FavoriteShowButton
              showSlug={show.showSlug}
              showTitle={show.showTitle}
              initialFavorited={show.isFavorited}
              signedIn={Boolean(user)}
            />
          </div>
        </div>
      </div>

      {show.seasons.map(({ season, videos }) => (
        <section key={season ?? "extras"}>
          <h2 className="mb-4 font-display text-2xl text-cream">
            {season != null ? `Season ${season}` : show.seasons.length > 1 ? "Other episodes" : "Episodes"}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} showShowTitle={false} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
