"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, type SessionUser } from "@/lib/auth-helpers";
import { fieldErrorsFrom, playlistSchema } from "@/lib/validation";
import {
  ensurePlaylistBaseline,
  parseItemsJson,
  snapshotPlaylist,
} from "@/lib/revisions";
import { formatDate } from "@/lib/format";
import {
  refreshPlaylistStats,
  refreshPublicStatsForVideo,
  refreshPublicStatsForVideos,
} from "@/lib/public-stats";
import type { ActionResult, FormState } from "@/lib/types";

function parsePlaylistForm(formData: FormData) {
  return playlistSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    isPublic: formData.get("isPublic"),
  });
}

type EditablePlaylist = Prisma.PlaylistGetPayload<{
  select: {
    id: true;
    userId: true;
    name: true;
    description: true;
    isPublic: true;
    createdAt: true;
  };
}>;

/**
 * Community-editing rule: owners and admins can always edit; any signed-in
 * user can edit PUBLIC playlists (every change is versioned, so griefing is
 * one restore away). Private playlists stay owner/admin-only.
 */
async function getEditablePlaylist(
  playlistId: string,
  user: SessionUser
): Promise<{ playlist: EditablePlaylist; isOwner: boolean } | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      isPublic: true,
      createdAt: true,
    },
  });
  if (!playlist) return null;
  const isOwner = playlist.userId === user.id || user.isAdmin;
  if (!isOwner && !playlist.isPublic) return null;
  return { playlist, isOwner };
}

function revalidatePlaylistSurfaces(playlistId: string) {
  revalidatePath(`/playlists/${playlistId}`);
  revalidatePath(`/playlists/${playlistId}/history`);
  revalidatePath("/playlists");
  revalidatePath("/my-list");
}

export async function createPlaylist(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to create playlists" };

  const parsed = parsePlaylistForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const playlist = await prisma.$transaction(async (tx) => {
    const row = await tx.playlist.create({
      data: {
        ...parsed.data,
        description: parsed.data.description ?? null,
        userId: user.id,
      },
      select: { id: true },
    });
    await snapshotPlaylist(tx, row.id, user.id, { note: "created" });
    await refreshPlaylistStats(tx, row.id);
    return row;
  });
  redirect(`/playlists/${playlist.id}`);
}

export async function updatePlaylist(
  playlistId: string,
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in first" };
  const editable = await getEditablePlaylist(playlistId, user);
  if (!editable) return { error: "Playlist not found" };

  const parsed = parsePlaylistForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  await prisma.$transaction(async (tx) => {
    await ensurePlaylistBaseline(tx, editable.playlist);
    await tx.playlist.update({
      where: { id: playlistId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        // Visibility is the owner's call — community editors can't flip it.
        ...(editable.isOwner ? { isPublic: parsed.data.isPublic } : {}),
      },
    });
    await snapshotPlaylist(tx, playlistId, user.id);
  });

  revalidatePlaylistSurfaces(playlistId);
  return undefined;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { userId: true },
  });
  // Deletion is NOT community-editable: owner or admin only.
  if (!playlist || (playlist.userId !== user.id && !user.isAdmin)) {
    redirect("/playlists");
  }

  const videoIds = await prisma.$transaction(async (tx) => {
    const items = await tx.playlistItem.findMany({
      where: { playlistId },
      select: { videoId: true },
    });
    await tx.playlist.delete({ where: { id: playlistId } });
    await refreshPublicStatsForVideos(tx, items.map((item) => item.videoId));
    return items.map((item) => item.videoId);
  });
  revalidatePath("/playlists");
  revalidatePath("/my-list");
  for (const videoId of videoIds) revalidatePath(`/watch/${videoId}`);
  redirect("/my-list");
}

export async function addToPlaylist(
  playlistId: string,
  videoId: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to use playlists" };
  const editable = await getEditablePlaylist(playlistId, user);
  if (!editable) return { ok: false, error: "Playlist not found" };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isHidden: true },
  });
  if (!video || video.isHidden) return { ok: false, error: "Video not found" };

  try {
    await prisma.$transaction(async (tx) => {
      await ensurePlaylistBaseline(tx, editable.playlist);
      const max = await tx.playlistItem.aggregate({
        where: { playlistId },
        _max: { position: true },
      });
      await tx.playlistItem.create({
        data: { playlistId, videoId, position: (max._max.position ?? 0) + 1 },
      });
      await tx.playlist.update({
        where: { id: playlistId },
        data: { updatedAt: new Date() },
      });
      await snapshotPlaylist(tx, playlistId, user.id, { squash: true });
      await refreshPublicStatsForVideo(tx, videoId);
      await refreshPlaylistStats(tx, playlistId);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `Already in “${editable.playlist.name}”` };
    }
    throw e;
  }

  revalidatePath(`/watch/${videoId}`);
  revalidatePlaylistSurfaces(playlistId);
  return { ok: true, message: `Added to “${editable.playlist.name}”` };
}

/** Quick-create from the watch page popover: new public playlist seeded with this video. */
export async function createPlaylistAndAdd(
  name: string,
  videoId: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to use playlists" };

  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > 80) {
    return { ok: false, error: "Give the playlist a name (max 80 chars)" };
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isHidden: true },
  });
  if (!video || video.isHidden) return { ok: false, error: "Video not found" };

  await prisma.$transaction(async (tx) => {
    const row = await tx.playlist.create({
      data: {
        name: trimmed,
        userId: user.id,
        items: { create: { videoId, position: 1 } },
      },
      select: { id: true },
    });
    await snapshotPlaylist(tx, row.id, user.id, { note: "created" });
    await refreshPublicStatsForVideo(tx, videoId);
    await refreshPlaylistStats(tx, row.id);
  });

  revalidatePath(`/watch/${videoId}`);
  revalidatePath("/playlists");
  revalidatePath("/my-list");
  return { ok: true, message: `Created “${trimmed}”` };
}

export async function removeFromPlaylist(itemId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };

  const item = await prisma.playlistItem.findUnique({
    where: { id: itemId },
    select: { id: true, playlistId: true, videoId: true, position: true },
  });
  if (!item) return { ok: false, error: "Not in this playlist" };
  const editable = await getEditablePlaylist(item.playlistId, user);
  if (!editable) return { ok: false, error: "Playlist not found" };

  await prisma.$transaction(async (tx) => {
    await ensurePlaylistBaseline(tx, editable.playlist);
    await tx.playlistItem.delete({ where: { id: itemId } });
    // Close the gap in one statement instead of rewriting every row —
    // relative order is preserved even if legacy positions had holes.
    await tx.playlistItem.updateMany({
      where: { playlistId: item.playlistId, position: { gt: item.position } },
      data: { position: { decrement: 1 } },
    });
    await snapshotPlaylist(tx, item.playlistId, user.id, { squash: true });
    await refreshPublicStatsForVideo(tx, item.videoId);
    await refreshPlaylistStats(tx, item.playlistId);
  });

  revalidatePlaylistSurfaces(item.playlistId);
  return { ok: true };
}

export async function moveItem(
  itemId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Invalid direction" };
  }

  const item = await prisma.playlistItem.findUnique({
    where: { id: itemId },
    select: { id: true, position: true, playlistId: true },
  });
  if (!item) return { ok: false, error: "Not in this playlist" };
  const editable = await getEditablePlaylist(item.playlistId, user);
  if (!editable) return { ok: false, error: "Playlist not found" };

  const neighbor = await prisma.playlistItem.findFirst({
    where: {
      playlistId: item.playlistId,
      position: direction === "up" ? { lt: item.position } : { gt: item.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true },
  });
  if (!neighbor) return { ok: true }; // already at the edge

  await prisma.$transaction(async (tx) => {
    await ensurePlaylistBaseline(tx, editable.playlist);
    await tx.playlistItem.update({
      where: { id: item.id },
      data: { position: neighbor.position },
    });
    await tx.playlistItem.update({
      where: { id: neighbor.id },
      data: { position: item.position },
    });
    await snapshotPlaylist(tx, item.playlistId, user.id, { squash: true });
  });

  revalidatePlaylistSurfaces(item.playlistId);
  return { ok: true };
}

export async function restorePlaylistRevision(
  revisionId: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to restore versions" };

  const revision = await prisma.playlistRevision.findUnique({
    where: { id: revisionId },
  });
  if (!revision) return { ok: false, error: "Version not found" };
  const editable = await getEditablePlaylist(revision.playlistId, user);
  if (!editable) return { ok: false, error: "Playlist not found" };

  const wantedIds = parseItemsJson(revision.itemsJson);
  // Keep only videos that still exist in the catalog (hidden ones are fine —
  // they're filtered from display but shouldn't be silently dropped).
  const existing = await prisma.video.findMany({
    where: { id: { in: wantedIds } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((v) => v.id));
  const restoredIds = wantedIds.filter((id) => existingIds.has(id));
  let previousIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    await ensurePlaylistBaseline(tx, editable.playlist);
    previousIds = (
      await tx.playlistItem.findMany({
        where: { playlistId: revision.playlistId },
        select: { videoId: true },
      })
    ).map((item) => item.videoId);
    await tx.playlist.update({
      where: { id: revision.playlistId },
      data: { name: revision.name, description: revision.description },
    });
    await tx.playlistItem.deleteMany({ where: { playlistId: revision.playlistId } });
    if (restoredIds.length > 0) {
      await tx.playlistItem.createMany({
        data: restoredIds.map((videoId, i) => ({
          playlistId: revision.playlistId,
          videoId,
          position: i + 1,
        })),
      });
    }
    await snapshotPlaylist(tx, revision.playlistId, user.id, {
      note: `restored version from ${formatDate(revision.createdAt)}`,
    });
    await refreshPublicStatsForVideos(tx, [...previousIds, ...restoredIds]);
    await refreshPlaylistStats(tx, revision.playlistId);
  });

  revalidatePlaylistSurfaces(revision.playlistId);
  const dropped = wantedIds.length - restoredIds.length;
  return {
    ok: true,
    message:
      dropped > 0
        ? `Version restored (${dropped} video${dropped === 1 ? "" : "s"} no longer exist${dropped === 1 ? "s" : ""})`
        : "Version restored",
  };
}

export async function togglePlaylistFollow(playlistId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to save playlists" };

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, isPublic: true, userId: true },
  });
  if (!playlist || (!playlist.isPublic && playlist.userId !== user.id && !user.isAdmin)) {
    return { ok: false, error: "Playlist not found" };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.playlistFollow.findUnique({
      where: { userId_playlistId: { userId: user.id, playlistId } },
      select: { id: true },
    });
    if (existing) {
      await tx.playlistFollow.delete({ where: { id: existing.id } });
    } else {
      await tx.playlistFollow.create({ data: { userId: user.id, playlistId } });
    }
    await refreshPlaylistStats(tx, playlistId);
  });

  revalidatePath(`/playlists/${playlistId}`);
  revalidatePath("/playlists");
  revalidatePath("/my-list");
  return { ok: true };
}
