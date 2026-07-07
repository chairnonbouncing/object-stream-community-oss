import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveThumbnail } from "@/lib/video-url";
import { splitTags } from "@/lib/format";
import {
  getRatingMap,
  withRatings,
  type VideoWithRating,
} from "@/lib/queries/videos";

export type ShowSummary = {
  showId?: string;
  showSlug: string;
  showTitle: string;
  description: string | null;
  status: string;
  episodeCount: number;
  thumbnailUrl: string;
  latestAddedAt: Date;
  avgRating: number | null;
  ratingCount: number;
  ageRangeTag: string;
  viewCount: number;
  totalMarkedWatchedCount: number;
  estimatedSecondsWatched: number;
  followerCount: number;
  reviewCount: number;
  isUpcoming?: boolean;
};

export type ShowSort = "episodes" | "recent" | "rating" | "views" | "followers";

export const SHOW_SORTS: ShowSort[] = [
  "episodes",
  "recent",
  "rating",
  "views",
  "followers",
];

export function isShowSort(value: string | undefined): value is ShowSort {
  return Boolean(value && SHOW_SORTS.includes(value as ShowSort));
}

export async function getShowSummaries(
  opts: {
    take?: number;
    sort?: ShowSort;
    q?: string;
    status?: string;
    ageRangeTag?: string;
    includeHidden?: boolean;
  } = {}
): Promise<ShowSummary[]> {
  const query = opts.q?.trim();
  const where: Prisma.ShowWhereInput = {
    ...(opts.includeHidden ? {} : { isHidden: false }),
    videos: { some: { isHidden: false } },
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { slug: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.ageRangeTag ? { ageRangeTag: opts.ageRangeTag } : {}),
  };

  const sort = opts.sort ?? "episodes";
  const orderBy: Prisma.ShowOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ updatedAt: "desc" }]
      : sort === "rating"
        ? [{ averageRating: "desc" }, { reviewCount: "desc" }, { updatedAt: "desc" }]
        : sort === "views"
          ? [{ viewCount: "desc" }, { updatedAt: "desc" }]
          : sort === "followers"
            ? [{ followerCount: "desc" }, { updatedAt: "desc" }]
            : [{ videos: { _count: "desc" } }, { updatedAt: "desc" }];

  const showRows = await prisma.show.findMany({
    where,
    orderBy,
    take: opts.take,
    select: {
      id: true,
      slug: true,
      title: true,
      coverImageUrl: true,
      description: true,
      status: true,
      ageRangeTag: true,
      viewCount: true,
      totalMarkedWatchedCount: true,
      estimatedSecondsWatched: true,
      followerCount: true,
      reviewCount: true,
      averageRating: true,
      isUpcoming: true,
      isHidden: true,
      updatedAt: true,
      _count: { select: { videos: { where: { isHidden: false } } } },
      videos: {
        where: { isHidden: false },
        orderBy: [
          { seasonNumber: "asc" },
          { episodeNumber: "asc" },
          { createdAt: "asc" },
        ],
        take: 1,
        select: {
          thumbnailUrl: true,
          provider: true,
          providerVideoId: true,
          createdAt: true,
        },
      },
    },
  });

  return showRows.map((show) => {
    const rep = show.videos[0];
    return {
      showId: show.id,
      showSlug: show.slug,
      showTitle: show.title,
      description: show.description,
      status: show.status,
      episodeCount: show._count.videos,
      thumbnailUrl: show.coverImageUrl ?? (rep ? resolveThumbnail(rep) : "/images/placeholder-thumb.svg"),
      latestAddedAt: rep?.createdAt ?? show.updatedAt,
      avgRating: show.averageRating > 0 ? show.averageRating : null,
      ratingCount: show.reviewCount,
      ageRangeTag: show.ageRangeTag,
      viewCount: show.viewCount,
      totalMarkedWatchedCount: show.totalMarkedWatchedCount,
      estimatedSecondsWatched: show.estimatedSecondsWatched,
      followerCount: show.followerCount,
      reviewCount: show.reviewCount,
      isUpcoming: show.isUpcoming,
    };
  });
}

export async function getCompleteShowSummaries(take = 8): Promise<ShowSummary[]> {
  const shows = await getShowSummaries({ sort: "rating" });
  return shows
    .filter((show) => show.status === "Completed" || show.status === "One-shot")
    .slice(0, take);
}

export async function searchShowSummaries(
  q: string,
  opts: { take?: number; includeHidden?: boolean } = {}
): Promise<ShowSummary[]> {
  return getShowSummaries({
    q,
    take: opts.take ?? 6,
    sort: "rating",
    includeHidden: opts.includeHidden,
  });
}

export type ShowDetail = {
  showSlug: string;
  showId?: string;
  showTitle: string;
  description: string | null;
  ageRangeTag: string;
  coverImageUrl: string | null;
  videos: VideoWithRating[];
  seasons: Array<{ season: number | null; videos: VideoWithRating[] }>;
  avgRating: number | null;
  ratingCount: number;
  totalViews: number;
  totalMarkedWatchedCount: number;
  estimatedSecondsWatched: number;
  followerCount: number;
  reviewCount: number;
  wikiPageCount: number;
  statuses: string[];
  genres: string[];
  languages: string[];
  years: number[];
  isFavorited: boolean;
};

export async function getShowDetail(
  slug: string,
  userId?: string
): Promise<ShowDetail | null> {
  const rows = await prisma.video.findMany({
    where: { showSlug: slug, isHidden: false },
    orderBy: [
      { seasonNumber: "asc" },
      { episodeNumber: "asc" },
      { createdAt: "asc" },
    ],
  });
  if (rows.length === 0) return null;
  const showRow = await prisma.show.findUnique({ where: { slug } });
  const wikiPageCount = showRow
    ? await prisma.wikiPage.count({
        where: {
          isHidden: false,
          OR: [{ relatedShowId: showRow.id }, { relatedVideo: { showId: showRow.id } }],
        },
      })
    : 0;

  const ratings = await getRatingMap(rows.map((r) => r.id));
  const videos = withRatings(rows, ratings);

  let sum = 0;
  let count = 0;
  for (const r of ratings.values()) {
    sum += (r.avg ?? 0) * r.count;
    count += r.count;
  }

  const seasonsMap = new Map<number | null, VideoWithRating[]>();
  for (const v of videos) {
    const key = v.seasonNumber;
    const list = seasonsMap.get(key) ?? [];
    list.push(v);
    seasonsMap.set(key, list);
  }
  const seasons = [...seasonsMap.entries()]
    .map(([season, vids]) => ({ season, videos: vids }))
    .sort((a, b) => (a.season ?? Infinity) - (b.season ?? Infinity));

  const isFavorited = userId
    ? Boolean(
        await prisma.favoriteShow.findUnique({
          where: { userId_showSlug: { userId, showSlug: slug } },
          select: { id: true },
        })
      )
    : false;

  return {
    showSlug: slug,
    showId: showRow?.id,
    showTitle: showRow?.title ?? videos[0].showTitle,
    description: showRow?.description ?? null,
    ageRangeTag: showRow?.ageRangeTag ?? videos[0].ageRangeTag ?? "Unknown",
    coverImageUrl: showRow?.coverImageUrl ?? null,
    videos,
    seasons,
    avgRating:
      showRow && showRow.averageRating > 0
        ? showRow.averageRating
        : count > 0
          ? sum / count
          : null,
    ratingCount: showRow?.reviewCount ?? count,
    totalViews: showRow?.viewCount ?? 0,
    totalMarkedWatchedCount: showRow?.totalMarkedWatchedCount ?? 0,
    estimatedSecondsWatched: showRow?.estimatedSecondsWatched ?? 0,
    followerCount: showRow?.followerCount ?? 0,
    reviewCount: showRow?.reviewCount ?? 0,
    wikiPageCount,
    statuses: [...new Set(videos.map((v) => v.status))],
    genres: [...new Set(videos.flatMap((v) => splitTags(v.genreTags)))],
    languages: [...new Set(videos.map((v) => v.language))],
    years: [...new Set(videos.map((v) => v.releaseYear).filter((y): y is number => y != null))].sort(),
    isFavorited,
  };
}
