import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { getVimeoHash, resolveThumbnail, type VideoProvider } from "@/lib/video-url";
import {
  episodeLabel,
  formatCount,
  formatDate,
  formatHoursFromSeconds,
  formatRuntime,
} from "@/lib/format";
import { getRatingSummary, getRelatedVideos } from "@/lib/queries/videos";
import { getPlaylistPickerData, getWatchModeContext } from "@/lib/queries/playlists";
import { TheaterPlayer, type EpisodeEntry } from "@/components/watch/theater-player";
import { ViewTracker } from "@/components/watch/view-tracker";
import { RateStars } from "@/components/watch/rate-stars";
import { WatchStatusSelect } from "@/components/watch/watch-status-select";
import { AddToPlaylist } from "@/components/watch/add-to-playlist";
import { PlaylistSidebar } from "@/components/watch/playlist-sidebar";
import { ReportButton } from "@/components/shared/report-button";
import { DescriptionBlock } from "@/components/shared/description-block";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReviewList } from "@/components/reviews/review-list";
import { StarDisplay } from "@/components/video/star-display";
import { GenreChips } from "@/components/video/genre-chips";
import { VideoCard } from "@/components/video/video-card";
import { Badge } from "@/components/ui/badge";

type Params = Promise<{ videoId: string }>;
type SearchParams = Promise<{ list?: string; autoplay?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { videoId } = await params;
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { showTitle: true, episodeTitle: true },
  });
  if (!video) return { title: "Video not found" };
  return {
    title: video.episodeTitle
      ? `${video.episodeTitle} · ${video.showTitle}`
      : video.showTitle,
  };
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ videoId }, { list, autoplay }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { submittedBy: { select: { username: true } } },
  });
  if (!video) notFound();
  if (video.isHidden && !user?.isAdmin) notFound();

  const [ratingSummary, ownRating, ownStatus, reviews, related, pickerData, listContext] =
    await Promise.all([
      getRatingSummary(videoId),
      user
        ? prisma.rating.findUnique({
            where: { userId_videoId: { userId: user.id, videoId } },
            select: { rating: true },
          })
        : null,
      user
        ? prisma.watchStatus.findUnique({
            where: { userId_videoId: { userId: user.id, videoId } },
            select: { status: true },
          })
        : null,
      prisma.review.findMany({
        where: {
          videoId,
          OR: [{ isHidden: false }, ...(user ? [{ userId: user.id }] : [])],
        },
        include: { user: { select: { username: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      }),
      getRelatedVideos(video),
      user ? getPlaylistPickerData(user.id, videoId) : Promise.resolve([]),
      typeof list === "string" && list
        ? getWatchModeContext(list, videoId, user)
        : Promise.resolve(null),
    ]);

  const ownReview = user ? reviews.find((r) => r.userId === user.id) : undefined;
  const vimeoHash = getVimeoHash(video.originalUrl);
  const label = episodeLabel(video);
  const sameShowRelated = related.filter((v) => v.showSlug === video.showSlug);
  const otherRelated = related.filter((v) => v.showSlug !== video.showSlug);

  // Theater mode data: playlist entries when playing from a list, otherwise
  // the show's own episodes — so Next/auto-advance works through a show too.
  let episodes: EpisodeEntry[];
  let episodesTitle: string;
  let nextHref: string | undefined;
  if (listContext) {
    episodes = listContext.entries.map((e) => ({
      videoId: e.videoId,
      href: `/watch/${e.videoId}?list=${listContext.playlistId}`,
      title: e.episodeTitle ?? e.showTitle,
      label: e.showTitle,
      thumb: e.thumb,
      current: e.videoId === video.id,
    }));
    episodesTitle = listContext.playlistName;
    nextHref = listContext.nextVideoId
      ? `/watch/${listContext.nextVideoId}?list=${listContext.playlistId}&autoplay=1`
      : undefined;
  } else {
    const showEpisodes = await prisma.video.findMany({
      where: { showSlug: video.showSlug, isHidden: false },
      orderBy: [
        { seasonNumber: "asc" },
        { episodeNumber: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        episodeTitle: true,
        showTitle: true,
        seasonNumber: true,
        episodeNumber: true,
        provider: true,
        providerVideoId: true,
        thumbnailUrl: true,
      },
    });
    episodes = showEpisodes.map((e) => ({
      videoId: e.id,
      href: `/watch/${e.id}`,
      title: e.episodeTitle ?? e.showTitle,
      label: episodeLabel(e),
      thumb: resolveThumbnail(e),
      current: e.id === video.id,
    }));
    episodesTitle = video.showTitle;
    const currentIndex = showEpisodes.findIndex((e) => e.id === video.id);
    const next = currentIndex >= 0 ? showEpisodes[currentIndex + 1] : undefined;
    nextHref = next ? `/watch/${next.id}?autoplay=1` : undefined;
  }

  const seasonEpisode =
    video.seasonNumber != null && video.episodeNumber != null
      ? `S${video.seasonNumber}:E${video.episodeNumber}`
      : video.episodeNumber != null
        ? `E${video.episodeNumber}`
        : null;
  const theaterTitle = seasonEpisode
    ? `${seasonEpisode} “${video.episodeTitle ?? video.showTitle}”`
    : (video.episodeTitle ?? video.showTitle);

  return (
    <div className="space-y-10">
      <ViewTracker videoId={video.id} />

      {video.isHidden ? (
        <p className="rounded-2xl border border-osc-red/40 bg-osc-red/10 px-4 py-3 text-sm font-bold text-osc-red">
          This video is hidden from the public catalog — you can see it because
          you&apos;re an admin.
        </p>
      ) : null}

      <div
        className={
          listContext ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : undefined
        }
      >
        <div className="space-y-5">
          <TheaterPlayer
            key={video.id}
            provider={video.provider as VideoProvider}
            providerVideoId={video.providerVideoId}
            vimeoHash={vimeoHash}
            title={video.episodeTitle ?? video.showTitle}
            theaterTitle={theaterTitle}
            autoplay={autoplay === "1"}
            nextHref={nextHref}
            episodes={episodes}
            episodesTitle={episodesTitle}
          />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {label ? <Badge color="purple">{label}</Badge> : null}
              <Badge color={video.provider === "youtube" ? "red" : "blue"}>
                {video.provider === "youtube" ? "YouTube" : "Vimeo"}
              </Badge>
              {video.releaseYear ? (
                <span className="text-xs text-cream/50">{video.releaseYear}</span>
              ) : null}
              <Badge color="yellow">{video.ageRangeTag}</Badge>
              <span className="text-xs text-cream/50">{video.language}</span>
              {video.channelTitle ? (
                <span className="text-xs text-cream/50">{video.channelTitle}</span>
              ) : null}
              <span className="text-xs text-cream/50">
                {formatCount(video.viewCount)} views
              </span>
            </div>

            <h1 className="font-display text-2xl text-cream sm:text-4xl">
              {video.episodeTitle ?? video.showTitle}
            </h1>
            <p className="text-sm text-cream/70">
              from{" "}
              <Link
                href={`/shows/${video.showSlug}`}
                className="font-bold text-osc-blue hover:underline"
              >
                {video.showTitle}
              </Link>
              {" · "}
              <span className="text-cream/50">
                added {formatDate(video.createdAt)}
                {video.submittedBy ? (
                  <>
                    {" by "}
                    <Link
                      href={`/profile/${video.submittedBy.username}`}
                      className="text-cream/70 hover:text-osc-blue"
                    >
                      @{video.submittedBy.username}
                    </Link>
                  </>
                ) : null}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <StarDisplay avg={ratingSummary.avg} count={ratingSummary.count} />
              <RateStars
                videoId={video.id}
                initialRating={ownRating?.rating ?? null}
                signedIn={Boolean(user)}
              />
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs text-cream/55">
              {[
                `${formatCount(video.viewCount)} views`,
                `${formatCount(video.markedWatchedCount)} marked watched`,
                `${formatHoursFromSeconds(video.estimatedSecondsWatched)} watched`,
                `in ${formatCount(video.playlistAddCount)} playlists`,
                `${formatCount(video.reviewCount)} reviews`,
                ...(video.runtimeSeconds
                  ? [`runtime ${formatRuntime(video.runtimeSeconds)}`]
                  : []),
              ].map((stat, i) => (
                <span key={stat} className="flex items-center gap-2">
                  {i > 0 ? <span className="text-cream/25" aria-hidden>·</span> : null}
                  {stat}
                </span>
              ))}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <AddToPlaylist
                videoId={video.id}
                playlists={pickerData}
                signedIn={Boolean(user)}
              />
              <WatchStatusSelect
                videoId={video.id}
                initialStatus={ownStatus?.status ?? null}
                signedIn={Boolean(user)}
              />
              <ReportButton
                targetType="video"
                targetId={video.id}
                signedIn={Boolean(user)}
              />
              <Link
                href={`/watch/${video.id}/edit`}
                className="text-xs font-bold text-cream/40 hover:text-osc-blue"
                title="Community wiki: anyone can fix metadata — every change is versioned"
              >
                ✎ Edit info
              </Link>
            </div>

            {video.genreTags ? <GenreChips genreTags={video.genreTags} /> : null}

            {video.description ? (
              <DescriptionBlock text={video.description} />
            ) : null}

            <p className="hidden text-xs text-cream/35 sm:block">
              Shortcuts:{" "}
              <kbd className="rounded bg-white/10 px-1.5 font-sans">Space</kbd> play ·{" "}
              <kbd className="rounded bg-white/10 px-1.5 font-sans">←</kbd>
              <kbd className="ml-0.5 rounded bg-white/10 px-1.5 font-sans">→</kbd> ±10s ·{" "}
              <kbd className="rounded bg-white/10 px-1.5 font-sans">F</kbd> fullscreen ·{" "}
              <kbd className="rounded bg-white/10 px-1.5 font-sans">M</kbd> mute ·{" "}
              <kbd className="rounded bg-white/10 px-1.5 font-sans">C</kbd> captions — and the
              player now remembers where you left off.
            </p>

            <p className="text-xs text-cream/35">
              Playing via the official{" "}
              {video.provider === "youtube" ? "YouTube" : "Vimeo"} player — every view
              counts for the original creator.{" "}
              <a
                href={video.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-cream/60"
              >
                Open on {video.provider === "youtube" ? "YouTube" : "Vimeo"} ↗
              </a>
            </p>
          </div>
        </div>

        {listContext ? <PlaylistSidebar context={listContext} /> : null}
      </div>

      <section className="max-w-3xl space-y-5">
        <h2 className="font-display text-2xl text-cream">
          Reviews{" "}
          <span className="text-base text-cream/40">({reviews.length})</span>
        </h2>
        <ReviewForm
          videoId={video.id}
          existing={
            ownReview ? { text: ownReview.text, rating: ownReview.rating } : null
          }
          signedIn={Boolean(user)}
        />
        <ReviewList reviews={reviews} viewerId={user?.id ?? null} />
      </section>

      {sameShowRelated.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-2xl text-cream">
            More from {video.showTitle}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sameShowRelated.slice(0, 8).map((v) => (
              <VideoCard key={v.id} video={v} showShowTitle={false} />
            ))}
          </div>
        </section>
      ) : null}

      {otherRelated.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-2xl text-cream">You might also like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {otherRelated.slice(0, 8).map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
