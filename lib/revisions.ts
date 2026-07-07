import type { Prisma, Playlist, Video } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Consecutive playlist-item tweaks by the same editor within this window
 *  collapse into one revision, so a 10-step reorder isn't 10 history entries. */
const SQUASH_WINDOW_MS = 10 * 60 * 1000;

export function videoSnapshotData(video: Video) {
  return {
    showTitle: video.showTitle,
    episodeTitle: video.episodeTitle,
    seasonNumber: video.seasonNumber,
    episodeNumber: video.episodeNumber,
    description: video.description,
    ageRangeTag: video.ageRangeTag,
    genreTags: video.genreTags,
    language: video.language,
    releaseYear: video.releaseYear,
    status: video.status,
    thumbnailUrl: video.thumbnailUrl,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    youtubePlaylistId: video.youtubePlaylistId,
    playlistPosition: video.playlistPosition,
    runtimeSeconds: video.runtimeSeconds,
  };
}

/**
 * Rows created before versioning existed have no history. Before their first
 * edit, preserve the current state as a baseline revision so "the version
 * before the edit" is always restorable.
 */
export async function ensureVideoBaseline(tx: Tx, video: Video): Promise<void> {
  const count = await tx.videoRevision.count({ where: { videoId: video.id } });
  if (count > 0) return;
  await tx.videoRevision.create({
    data: {
      videoId: video.id,
      editorUserId: video.submittedByUserId,
      note: "original submission",
      createdAt: video.createdAt,
      ...videoSnapshotData(video),
    },
  });
}

export async function snapshotVideo(
  tx: Tx,
  video: Video,
  editorUserId: string,
  note?: string
): Promise<void> {
  await tx.videoRevision.create({
    data: {
      videoId: video.id,
      editorUserId,
      note: note ?? null,
      ...videoSnapshotData(video),
    },
  });
}

async function playlistItemIds(tx: Tx, playlistId: string): Promise<string[]> {
  const items = await tx.playlistItem.findMany({
    where: { playlistId },
    orderBy: { position: "asc" },
    select: { videoId: true },
  });
  return items.map((i) => i.videoId);
}

export async function ensurePlaylistBaseline(
  tx: Tx,
  playlist: Pick<Playlist, "id" | "name" | "description" | "userId" | "createdAt">
): Promise<void> {
  const count = await tx.playlistRevision.count({
    where: { playlistId: playlist.id },
  });
  if (count > 0) return;
  await tx.playlistRevision.create({
    data: {
      playlistId: playlist.id,
      editorUserId: playlist.userId,
      note: "created",
      createdAt: playlist.createdAt,
      name: playlist.name,
      description: playlist.description,
      itemsJson: JSON.stringify(await playlistItemIds(tx, playlist.id)),
    },
  });
}

/**
 * Records the playlist's current state as its newest revision. With `squash`,
 * a recent revision by the same editor is updated in place instead — but never
 * one carrying a note (baselines and restores stay untouchable).
 */
export async function snapshotPlaylist(
  tx: Tx,
  playlistId: string,
  editorUserId: string,
  opts: { note?: string; squash?: boolean } = {}
): Promise<void> {
  const playlist = await tx.playlist.findUnique({
    where: { id: playlistId },
    select: { name: true, description: true },
  });
  if (!playlist) return;
  const itemsJson = JSON.stringify(await playlistItemIds(tx, playlistId));

  if (opts.squash && !opts.note) {
    const latest = await tx.playlistRevision.findFirst({
      where: { playlistId },
      orderBy: { createdAt: "desc" },
    });
    if (
      latest &&
      latest.editorUserId === editorUserId &&
      !latest.note &&
      Date.now() - latest.createdAt.getTime() < SQUASH_WINDOW_MS
    ) {
      await tx.playlistRevision.update({
        where: { id: latest.id },
        data: {
          name: playlist.name,
          description: playlist.description,
          itemsJson,
          createdAt: new Date(),
        },
      });
      return;
    }
  }

  await tx.playlistRevision.create({
    data: {
      playlistId,
      editorUserId,
      note: opts.note ?? null,
      name: playlist.name,
      description: playlist.description,
      itemsJson,
    },
  });
}

export function parseItemsJson(itemsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
