import { prisma } from "@/lib/prisma";
import { resolveThumbnail, PLACEHOLDER_THUMB } from "@/lib/video-url";
import {
  getRatingMap,
  withRatings,
  type VideoWithRating,
} from "@/lib/queries/videos";

const cardInclude = {
  user: { select: { username: true } },
  _count: { select: { items: true } },
  items: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: {
      video: {
        select: { provider: true, providerVideoId: true, thumbnailUrl: true },
      },
    },
  },
};

export type PlaylistCardData = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  updatedAt: Date;
  ownerUsername: string;
  itemCount: number;
  viewCount: number;
  followerCount: number;
  totalRuntimeSeconds: number;
  markedWatchedCount: number;
  coverThumb: string;
};

type PlaylistWithCard = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  updatedAt: Date;
  viewCount: number;
  followerCount: number;
  totalRuntimeSeconds: number;
  markedWatchedCount: number;
  user: { username: string };
  _count: { items: number };
  items: Array<{
    video: { provider: string; providerVideoId: string; thumbnailUrl: string | null };
  }>;
};

function toCard(p: PlaylistWithCard): PlaylistCardData {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    isPublic: p.isPublic,
    updatedAt: p.updatedAt,
    ownerUsername: p.user.username,
    itemCount: p._count.items,
    viewCount: p.viewCount,
    followerCount: p.followerCount,
    totalRuntimeSeconds: p.totalRuntimeSeconds,
    markedWatchedCount: p.markedWatchedCount,
    coverThumb: p.items[0] ? resolveThumbnail(p.items[0].video) : PLACEHOLDER_THUMB,
  };
}

export type PlaylistSort = "updated" | "saves" | "views" | "runtime" | "videos";

export const PLAYLIST_SORTS: PlaylistSort[] = [
  "updated",
  "saves",
  "views",
  "runtime",
  "videos",
];

export function isPlaylistSort(value: string | undefined): value is PlaylistSort {
  return Boolean(value && PLAYLIST_SORTS.includes(value as PlaylistSort));
}

export async function getPublicPlaylists(
  take = 60,
  opts: { q?: string; sort?: PlaylistSort } = {}
): Promise<PlaylistCardData[]> {
  const sort = opts.sort ?? "updated";
  const orderBy =
    sort === "saves"
      ? [{ followerCount: "desc" as const }, { updatedAt: "desc" as const }]
      : sort === "views"
        ? [{ viewCount: "desc" as const }, { updatedAt: "desc" as const }]
        : sort === "runtime"
          ? [{ totalRuntimeSeconds: "desc" as const }, { updatedAt: "desc" as const }]
          : sort === "videos"
            ? [{ items: { _count: "desc" as const } }, { updatedAt: "desc" as const }]
            : [{ updatedAt: "desc" as const }];

  const playlists = await prisma.playlist.findMany({
    where: {
      isPublic: true,
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" as const } },
              { description: { contains: opts.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    take,
    include: cardInclude,
  });
  return playlists.map(toCard);
}

export async function getPopularPlaylists(take = 8): Promise<PlaylistCardData[]> {
  const playlists = await prisma.playlist.findMany({
    where: { isPublic: true, items: { some: {} } },
    orderBy: [{ followerCount: "desc" }, { items: { _count: "desc" } }],
    take,
    include: cardInclude,
  });
  return playlists.map(toCard);
}

export async function getBingeablePlaylists(take = 8): Promise<PlaylistCardData[]> {
  const playlists = await prisma.playlist.findMany({
    where: { isPublic: true, items: { some: {} } },
    orderBy: [
      { followerCount: "desc" },
      { viewCount: "desc" },
      { items: { _count: "desc" } },
    ],
    take: Math.max(take * 4, 16),
    include: cardInclude,
  });
  return playlists.map(toCard).filter((playlist) => playlist.itemCount >= 3).slice(0, take);
}

export async function searchPublicPlaylists(
  q: string,
  take = 6
): Promise<PlaylistCardData[]> {
  return getPublicPlaylists(take, { q, sort: "saves" });
}

export async function getUserPlaylists(userId: string): Promise<PlaylistCardData[]> {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: cardInclude,
  });
  return playlists.map(toCard);
}

/** For the add-to-playlist popover: the user's playlists + whether each has this video. */
export async function getPlaylistPickerData(userId: string, videoId: string) {
  const playlists = await prisma.playlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true } },
      items: { where: { videoId }, select: { id: true } },
    },
  });
  return playlists.map((p) => ({
    id: p.id,
    name: p.name,
    itemCount: p._count.items,
    containsVideo: p.items.length > 0,
  }));
}

export type PlaylistDetail = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  userId: string;
  ownerUsername: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  followerCount: number;
  totalRuntimeSeconds: number;
  markedWatchedCount: number;
  isFollowing: boolean;
  items: Array<{ itemId: string; position: number; video: VideoWithRating }>;
};

export async function getPlaylistWithItems(
  id: string,
  viewerId?: string
): Promise<PlaylistDetail | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      items: { orderBy: { position: "asc" }, include: { video: true } },
    },
  });
  if (!playlist) return null;
  const isFollowing = viewerId
    ? Boolean(
        await prisma.playlistFollow.findUnique({
          where: { userId_playlistId: { userId: viewerId, playlistId: playlist.id } },
          select: { id: true },
        })
      )
    : false;

  const visible = playlist.items.filter((i) => !i.video.isHidden);
  const ratings = await getRatingMap(visible.map((i) => i.video.id));
  const rated = withRatings(visible.map((i) => i.video), ratings);
  const ratedById = new Map(rated.map((v) => [v.id, v]));

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    isPublic: playlist.isPublic,
    userId: playlist.userId,
    ownerUsername: playlist.user.username,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    viewCount: playlist.viewCount,
    followerCount: playlist.followerCount,
    totalRuntimeSeconds: playlist.totalRuntimeSeconds,
    markedWatchedCount: playlist.markedWatchedCount,
    isFollowing,
    items: visible.map((i) => ({
      itemId: i.id,
      position: i.position,
      video: ratedById.get(i.videoId)!,
    })),
  };
}

export type WatchModeContext = {
  playlistId: string;
  playlistName: string;
  entries: Array<{
    videoId: string;
    position: number;
    episodeTitle: string | null;
    showTitle: string;
    thumb: string;
  }>;
  currentIndex: number;
  prevVideoId: string | null;
  nextVideoId: string | null;
};

/** Playlist context for /watch?list= — null when missing or not viewable. */
export async function getWatchModeContext(
  listId: string,
  videoId: string,
  viewer: { id: string; isAdmin: boolean } | null
): Promise<WatchModeContext | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          video: {
            select: {
              id: true,
              episodeTitle: true,
              showTitle: true,
              provider: true,
              providerVideoId: true,
              thumbnailUrl: true,
              isHidden: true,
            },
          },
        },
      },
    },
  });
  if (!playlist) return null;
  const canView =
    playlist.isPublic || playlist.userId === viewer?.id || Boolean(viewer?.isAdmin);
  if (!canView) return null;

  const entries = playlist.items
    .filter((i) => !i.video.isHidden)
    .map((i) => ({
      videoId: i.video.id,
      position: i.position,
      episodeTitle: i.video.episodeTitle,
      showTitle: i.video.showTitle,
      thumb: resolveThumbnail(i.video),
    }));

  const currentIndex = entries.findIndex((e) => e.videoId === videoId);
  if (currentIndex === -1) return null;

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    entries,
    currentIndex,
    prevVideoId: currentIndex > 0 ? entries[currentIndex - 1].videoId : null,
    nextVideoId:
      currentIndex < entries.length - 1 ? entries[currentIndex + 1].videoId : null,
  };
}
