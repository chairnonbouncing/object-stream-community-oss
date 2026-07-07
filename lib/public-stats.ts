import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PublicViewKind } from "@/lib/public-view";
export { normalizeRuntimeSeconds, parseYouTubeDuration } from "@/lib/duration";

type Tx = Prisma.TransactionClient;

function ratingValue(value: number | null | undefined) {
  return value ?? 0;
}

export function formatHoursFromSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 hours";
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} min`;
  return `${hours.toFixed(hours >= 10 ? 0 : 1).replace(/\.0$/, "")} hours`;
}

export function formatRuntime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Runtime unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function refreshVideoStats(tx: Tx, videoId: string) {
  const [video, markedWatchedCount, playlistAddCount, reviewCount, ratingAgg] =
    await Promise.all([
      tx.video.findUnique({
        where: { id: videoId },
        select: { id: true, runtimeSeconds: true, showId: true, showSlug: true },
      }),
      tx.watchStatus.count({ where: { videoId, status: "Completed" } }),
      tx.playlistItem.count({ where: { videoId } }),
      tx.review.count({ where: { videoId, isHidden: false } }),
      tx.rating.aggregate({
        where: { videoId },
        _avg: { rating: true },
      }),
    ]);
  if (!video) return null;
  const estimatedSecondsWatched = video.runtimeSeconds
    ? markedWatchedCount * video.runtimeSeconds
    : 0;
  await tx.video.update({
    where: { id: videoId },
    data: {
      markedWatchedCount,
      estimatedSecondsWatched,
      playlistAddCount,
      reviewCount,
      averageRating: ratingValue(ratingAgg._avg.rating),
    },
  });
  return { showId: video.showId, showSlug: video.showSlug };
}

export async function refreshShowStatsById(tx: Tx, showId: string) {
  const show = await tx.show.findUnique({
    where: { id: showId },
    select: { id: true, slug: true },
  });
  if (!show) return;
  await refreshShowStats(tx, show.id, show.slug);
}

export async function refreshShowStatsBySlug(tx: Tx, slug: string) {
  const show = await tx.show.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!show) return;
  await refreshShowStats(tx, show.id, show.slug);
}

async function refreshShowStats(tx: Tx, showId: string, showSlug: string) {
  const videos = await tx.video.findMany({
    where: {
      isHidden: false,
      OR: [{ showId }, { showSlug }],
    },
    select: { id: true, estimatedSecondsWatched: true },
  });
  const videoIds = videos.map((v) => v.id);
  const [totalMarkedWatchedCount, followerCount, reviewCount, ratingAgg] =
    await Promise.all([
      videoIds.length
        ? tx.watchStatus.count({
            where: { videoId: { in: videoIds }, status: "Completed" },
          })
        : 0,
      tx.favoriteShow.count({ where: { showSlug } }),
      videoIds.length
        ? tx.review.count({
            where: { videoId: { in: videoIds }, isHidden: false },
          })
        : 0,
      videoIds.length
        ? tx.rating.aggregate({
            where: { videoId: { in: videoIds } },
            _avg: { rating: true },
          })
        : Promise.resolve({ _avg: { rating: null } }),
    ]);
  await tx.show.update({
    where: { id: showId },
    data: {
      totalMarkedWatchedCount,
      estimatedSecondsWatched: videos.reduce(
        (sum, video) => sum + video.estimatedSecondsWatched,
        0
      ),
      followerCount,
      reviewCount,
      averageRating: ratingValue(ratingAgg._avg.rating),
    },
  });
}

export async function refreshShowStatsForVideo(tx: Tx, videoId: string) {
  const video = await tx.video.findUnique({
    where: { id: videoId },
    select: { showId: true, showSlug: true },
  });
  if (video?.showId) await refreshShowStatsById(tx, video.showId);
  else if (video?.showSlug) await refreshShowStatsBySlug(tx, video.showSlug);
}

export async function refreshPlaylistStats(tx: Tx, playlistId: string) {
  const playlist = await tx.playlist.findUnique({
    where: { id: playlistId },
    include: {
      items: {
        select: {
          videoId: true,
          video: { select: { runtimeSeconds: true, isHidden: true } },
        },
      },
    },
  });
  if (!playlist) return;
  const visibleItems = playlist.items.filter((item) => !item.video.isHidden);
  const videoIds = visibleItems.map((item) => item.videoId);
  const [followerCount, markedWatchedCount] = await Promise.all([
    tx.playlistFollow.count({ where: { playlistId } }),
    videoIds.length
      ? tx.watchStatus.count({
          where: { videoId: { in: videoIds }, status: "Completed" },
        })
      : 0,
  ]);
  await tx.playlist.update({
    where: { id: playlistId },
    data: {
      followerCount,
      markedWatchedCount,
      totalRuntimeSeconds: visibleItems.reduce(
        (sum, item) => sum + (item.video.runtimeSeconds ?? 0),
        0
      ),
    },
  });
}

export async function refreshPlaylistsForVideo(tx: Tx, videoId: string) {
  const rows = await tx.playlistItem.findMany({
    where: { videoId },
    distinct: ["playlistId"],
    select: { playlistId: true },
  });
  for (const row of rows) await refreshPlaylistStats(tx, row.playlistId);
  return rows.map((row) => row.playlistId);
}

export async function refreshWikiPageStats(tx: Tx, wikiPageId: string) {
  const [revisionCount, latestRevision, watcherCount] = await Promise.all([
    tx.wikiRevision.count({ where: { wikiPageId } }),
    tx.wikiRevision.findFirst({
      where: { wikiPageId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    tx.wikiPageWatch.count({ where: { wikiPageId } }),
  ]);
  await tx.wikiPage.update({
    where: { id: wikiPageId },
    data: {
      editCount: revisionCount,
      revisionCount,
      watcherCount,
      lastEditedAt: latestRevision?.createdAt ?? null,
    },
  });
}

export async function refreshPublicStatsForVideo(tx: Tx, videoId: string) {
  const show = await refreshVideoStats(tx, videoId);
  if (show?.showId) await refreshShowStatsById(tx, show.showId);
  else if (show?.showSlug) await refreshShowStatsBySlug(tx, show.showSlug);
  return refreshPlaylistsForVideo(tx, videoId);
}

export async function refreshPublicStatsForVideos(tx: Tx, videoIds: string[]) {
  for (const videoId of [...new Set(videoIds)]) {
    await refreshPublicStatsForVideo(tx, videoId);
  }
}

export async function backfillPublicStats() {
  const [videoIds, showIds, playlistIds, wikiPageIds] = await Promise.all([
    prisma.video.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.show.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.playlist.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
    prisma.wikiPage.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
  ]);

  for (const { id } of videoIds) {
    await prisma.$transaction((tx) => refreshVideoStats(tx, id));
  }
  for (const { id } of showIds) {
    await prisma.$transaction((tx) => refreshShowStatsById(tx, id));
  }
  for (const { id } of playlistIds) {
    await prisma.$transaction((tx) => refreshPlaylistStats(tx, id));
  }
  for (const { id } of wikiPageIds) {
    await prisma.$transaction((tx) => refreshWikiPageStats(tx, id));
  }
}

export async function incrementPublicView(kind: PublicViewKind, targetId: string) {
  if (!targetId) return false;
  if (kind === "video") {
    const result = await prisma.video.updateMany({
      where: { id: targetId, isHidden: false },
      data: { viewCount: { increment: 1 } },
    });
    return result.count > 0;
  }
  if (kind === "show") {
    const result = await prisma.show.updateMany({
      where: { id: targetId, isHidden: false },
      data: { viewCount: { increment: 1 } },
    });
    return result.count > 0;
  }
  if (kind === "playlist") {
    const result = await prisma.playlist.updateMany({
      where: { id: targetId, isPublic: true },
      data: { viewCount: { increment: 1 } },
    });
    return result.count > 0;
  }
  const result = await prisma.wikiPage.updateMany({
    where: { id: targetId, isHidden: false },
    data: { viewCount: { increment: 1 } },
  });
  return result.count > 0;
}
