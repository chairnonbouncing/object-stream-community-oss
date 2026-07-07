import { Prisma, type Video } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE } from "@/lib/constants";
import { splitTags } from "@/lib/format";

export type RatingSummary = { avg: number | null; count: number };
export type VideoWithRating = Video & { avgRating: number | null; ratingCount: number };

export async function getRatingSummary(videoId: string): Promise<RatingSummary> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { averageRating: true, reviewCount: true },
  });
  if (!video) return { avg: null, count: 0 };
  return {
    avg: video.averageRating > 0 ? video.averageRating : null,
    count: video.reviewCount,
  };
}

export async function getRatingMap(
  videoIds: string[]
): Promise<Map<string, RatingSummary>> {
  if (videoIds.length === 0) return new Map();
  const groups = await prisma.rating.groupBy({
    by: ["videoId"],
    where: { videoId: { in: videoIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    groups.map((g) => [g.videoId, { avg: g._avg.rating, count: g._count._all }])
  );
}

export function withRatings(
  videos: Video[],
  ratings: Map<string, RatingSummary>
): VideoWithRating[] {
  return videos.map((v) => {
    const r = ratings.get(v.id);
    return {
      ...v,
      avgRating: v.averageRating > 0 ? v.averageRating : (r?.avg ?? null),
      ratingCount: v.reviewCount || r?.count || 0,
    };
  });
}

export type DiscoverSort = "recent" | "rating" | "views" | "watched" | "runtime";
export type DiscoverRuntime = "short" | "standard" | "long" | "unknown";

export const DISCOVER_SORTS: DiscoverSort[] = [
  "recent",
  "rating",
  "views",
  "watched",
  "runtime",
];

export const DISCOVER_RUNTIME_FILTERS: DiscoverRuntime[] = [
  "short",
  "standard",
  "long",
  "unknown",
];

export function isDiscoverSort(value: string | undefined): value is DiscoverSort {
  return Boolean(value && DISCOVER_SORTS.includes(value as DiscoverSort));
}

export function isDiscoverRuntime(
  value: string | undefined
): value is DiscoverRuntime {
  return Boolean(value && DISCOVER_RUNTIME_FILTERS.includes(value as DiscoverRuntime));
}

export type DiscoverFilters = {
  q?: string;
  genre?: string;
  status?: string;
  year?: number;
  language?: string;
  provider?: string;
  ageRangeTag?: string;
  runtime?: DiscoverRuntime;
  sort?: DiscoverSort;
  page?: number;
};

export function buildVideoWhere(f: DiscoverFilters): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = { isHidden: false };
  if (f.q) {
    // Postgres `contains` is case-sensitive by default (unlike SQLite, where
    // this app was born) — insensitive is what searchers expect.
    where.OR = [
      { showTitle: { contains: f.q, mode: "insensitive" } },
      { episodeTitle: { contains: f.q, mode: "insensitive" } },
      { description: { contains: f.q, mode: "insensitive" } },
      { genreTags: { contains: f.q.toLowerCase() } },
    ];
  }
  if (f.genre) where.genreTags = { contains: f.genre.toLowerCase() };
  if (f.status) where.status = f.status;
  if (f.year) where.releaseYear = f.year;
  if (f.language) where.language = f.language;
  if (f.provider) where.provider = f.provider;
  if (f.ageRangeTag) where.ageRangeTag = f.ageRangeTag;
  if (f.runtime === "short") where.runtimeSeconds = { lte: 600 };
  if (f.runtime === "standard") where.runtimeSeconds = { gt: 600, lte: 1200 };
  if (f.runtime === "long") where.runtimeSeconds = { gt: 1200 };
  if (f.runtime === "unknown") where.runtimeSeconds = null;
  return where;
}

export type DiscoverPage = {
  videos: VideoWithRating[];
  total: number;
  page: number;
  pageCount: number;
};

export async function getDiscoverPage(f: DiscoverFilters): Promise<DiscoverPage> {
  const where = buildVideoWhere(f);
  const page = Math.max(1, f.page ?? 1);
  const sort: DiscoverSort = f.sort ?? "recent";

  const orderBy: Prisma.VideoOrderByWithRelationInput[] =
    sort === "views"
      ? [{ viewCount: "desc" }, { createdAt: "desc" }]
      : sort === "watched"
        ? [{ markedWatchedCount: "desc" }, { viewCount: "desc" }, { createdAt: "desc" }]
        : sort === "runtime"
          ? [
              { runtimeSeconds: { sort: "asc", nulls: "last" } },
              { viewCount: "desc" },
              { createdAt: "desc" },
            ]
          : sort === "rating"
            ? [
                { averageRating: "desc" },
                { reviewCount: "desc" },
                { createdAt: "desc" },
              ]
            : [{ createdAt: "desc" }];
  const [total, rows] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const ratings = await getRatingMap(rows.map((r) => r.id));
  return {
    videos: withRatings(rows, ratings),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getDistinctYears(): Promise<number[]> {
  const rows = await prisma.video.findMany({
    where: { isHidden: false, releaseYear: { not: null } },
    select: { releaseYear: true },
    distinct: ["releaseYear"],
    orderBy: { releaseYear: "desc" },
  });
  return rows.map((r) => r.releaseYear).filter((y): y is number => y !== null);
}

/** Same show first (in episode order), then same-genre fill. */
export async function getRelatedVideos(
  video: Pick<Video, "id" | "showSlug" | "genreTags">,
  take = 12
): Promise<VideoWithRating[]> {
  const sameShow = await prisma.video.findMany({
    where: { showSlug: video.showSlug, isHidden: false, id: { not: video.id } },
    orderBy: [
      { seasonNumber: "asc" },
      { episodeNumber: "asc" },
      { createdAt: "asc" },
    ],
    take,
  });

  const picked = sameShow;
  const remaining = take - picked.length;
  if (remaining > 0) {
    const firstTag = splitTags(video.genreTags)[0];
    if (firstTag) {
      const sameGenre = await prisma.video.findMany({
        where: {
          isHidden: false,
          genreTags: { contains: firstTag },
          id: { notIn: [video.id, ...picked.map((v) => v.id)] },
          showSlug: { not: video.showSlug },
        },
        orderBy: { viewCount: "desc" },
        take: remaining,
      });
      picked.push(...sameGenre);
    }
  }

  const ratings = await getRatingMap(picked.map((v) => v.id));
  return withRatings(picked, ratings);
}
