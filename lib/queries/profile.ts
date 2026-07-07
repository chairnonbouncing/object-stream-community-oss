import { prisma } from "@/lib/prisma";
import { WATCH_STATUSES } from "@/lib/constants";
import {
  getRatingMap,
  withRatings,
  type VideoWithRating,
} from "@/lib/queries/videos";
import { getUserPlaylists, type PlaylistCardData } from "@/lib/queries/playlists";

export type ProfileData = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
  isAdmin: boolean;
  stats: {
    playlistsCreated: number;
    reviewsPosted: number;
    showsSubmitted: number;
  };
  submittedVideos: VideoWithRating[];
  submittedTotal: number;
  publicPlaylists: PlaylistCardData[];
  favoriteShows: Array<{ showSlug: string; showTitle: string }>;
};

export async function getProfileByUsername(
  username: string
): Promise<ProfileData | null> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });
  if (!user) return null;

  const [
    submittedVideos,
    submittedTotal,
    playlists,
    favoriteShows,
    playlistsCreated,
    reviewsPosted,
    submittedShows,
  ] = await Promise.all([
    prisma.video.findMany({
      where: { submittedByUserId: user.id, isHidden: false },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.video.count({ where: { submittedByUserId: user.id, isHidden: false } }),
    getUserPlaylists(user.id),
    prisma.favoriteShow.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { showSlug: true, showTitle: true },
    }),
    prisma.playlist.count({ where: { userId: user.id } }),
    prisma.review.count({ where: { userId: user.id, isHidden: false } }),
    prisma.video.findMany({
      where: { submittedByUserId: user.id, isHidden: false },
      select: { showSlug: true },
      distinct: ["showSlug"],
    }),
  ]);

  const cardIds = submittedVideos.map((v) => v.id);
  const ratings = await getRatingMap(cardIds);

  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    isAdmin: user.isAdmin,
    stats: {
      playlistsCreated,
      reviewsPosted,
      showsSubmitted: submittedShows.length,
    },
    submittedVideos: withRatings(submittedVideos, ratings),
    submittedTotal,
    publicPlaylists: playlists.filter((p) => p.isPublic),
    favoriteShows,
  };
}

export type MyListData = {
  groups: Array<{ status: string; videos: VideoWithRating[] }>;
  favoriteShows: Array<{ showSlug: string; showTitle: string }>;
  playlists: PlaylistCardData[];
  statusByVideo: Record<string, string>;
};

export async function getMyListData(userId: string): Promise<MyListData> {
  const [statuses, favoriteShows, playlists] = await Promise.all([
    prisma.watchStatus.findMany({
      where: { userId, video: { isHidden: false } },
      orderBy: { updatedAt: "desc" },
      include: { video: true },
    }),
    prisma.favoriteShow.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { showSlug: true, showTitle: true },
    }),
    getUserPlaylists(userId),
  ]);

  const ratings = await getRatingMap(statuses.map((s) => s.video.id));
  const statusByVideo: Record<string, string> = {};
  const byStatus = new Map<string, VideoWithRating[]>();
  for (const s of statuses) {
    statusByVideo[s.videoId] = s.status;
    const [video] = withRatings([s.video], ratings);
    const list = byStatus.get(s.status) ?? [];
    list.push(video);
    byStatus.set(s.status, list);
  }

  return {
    groups: WATCH_STATUSES.filter((s) => byStatus.has(s)).map((status) => ({
      status,
      videos: byStatus.get(status)!,
    })),
    favoriteShows,
    playlists,
    statusByVideo,
  };
}
