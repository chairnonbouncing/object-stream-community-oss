import { prisma } from "@/lib/prisma";
import { GENRES } from "@/lib/constants";
import {
  getRatingMap,
  withRatings,
  type VideoWithRating,
} from "@/lib/queries/videos";

/** Hero carousel: admin-featured first; recent uploads when nothing is featured. */
export async function getFeaturedVideos(take = 5): Promise<VideoWithRating[]> {
  let videos = await prisma.video.findMany({
    where: { isFeatured: true, isHidden: false },
    orderBy: { updatedAt: "desc" },
    take,
  });
  if (videos.length === 0) {
    videos = await prisma.video.findMany({
      where: { isHidden: false },
      orderBy: { viewCount: "desc" },
      take,
    });
  }
  const ratings = await getRatingMap(videos.map((v) => v.id));
  return withRatings(videos, ratings);
}

export async function getRecentVideos(take = 12): Promise<VideoWithRating[]> {
  const videos = await prisma.video.findMany({
    where: { isHidden: false },
    orderBy: { createdAt: "desc" },
    take,
  });
  const ratings = await getRatingMap(videos.map((v) => v.id));
  return withRatings(videos, ratings);
}

export async function getMostMarkedWatchedVideos(
  take = 12
): Promise<VideoWithRating[]> {
  const videos = await prisma.video.findMany({
    where: { isHidden: false },
    orderBy: [
      { markedWatchedCount: "desc" },
      { viewCount: "desc" },
      { createdAt: "desc" },
    ],
    take,
  });
  const ratings = await getRatingMap(videos.map((v) => v.id));
  return withRatings(videos, ratings);
}

export async function getHighlyRatedVideos(take = 12): Promise<VideoWithRating[]> {
  const videos = await prisma.video.findMany({
    where: { isHidden: false, averageRating: { gt: 0 } },
    orderBy: [
      { averageRating: "desc" },
      { reviewCount: "desc" },
      { viewCount: "desc" },
    ],
    take,
  });
  const ratings = await getRatingMap(videos.map((v) => v.id));
  return withRatings(videos, ratings);
}

export async function getShortEpisodeVideos(take = 12): Promise<VideoWithRating[]> {
  const videos = await prisma.video.findMany({
    where: { isHidden: false, runtimeSeconds: { lte: 600 } },
    orderBy: [
      { markedWatchedCount: "desc" },
      { viewCount: "desc" },
      { createdAt: "desc" },
    ],
    take,
  });
  const ratings = await getRatingMap(videos.map((v) => v.id));
  return withRatings(videos, ratings);
}

export type GenreRow = { genre: string; videos: VideoWithRating[] };

export async function getGenreRows(maxRows = 4, perRow = 12): Promise<GenreRow[]> {
  const rows: GenreRow[] = [];
  for (const genre of GENRES) {
    if (rows.length >= maxRows) break;
    const videos = await prisma.video.findMany({
      where: { isHidden: false, genreTags: { contains: genre } },
      orderBy: { viewCount: "desc" },
      take: perRow,
    });
    if (videos.length === 0) continue;
    const ratings = await getRatingMap(videos.map((v) => v.id));
    rows.push({ genre, videos: withRatings(videos, ratings) });
  }
  return rows;
}
