"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { watchStatusSchema } from "@/lib/validation";
import { refreshPublicStatsForVideo } from "@/lib/public-stats";
import type { ActionResult } from "@/lib/types";

export async function setWatchStatus(
  videoId: string,
  status: string | null
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to track what you watch" };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isHidden: true, showSlug: true },
  });
  if (!video || video.isHidden) return { ok: false, error: "Video not found" };

  let playlistIds: string[] = [];
  if (status === null) {
    await prisma.$transaction(async (tx) => {
      await tx.watchStatus.deleteMany({ where: { userId: user.id, videoId } });
      playlistIds = await refreshPublicStatsForVideo(tx, videoId);
    });
    revalidatePath(`/watch/${videoId}`);
    revalidatePath(`/shows/${video.showSlug}`);
    for (const playlistId of playlistIds) revalidatePath(`/playlists/${playlistId}`);
    revalidatePath("/my-list");
    return { ok: true };
  }

  const parsed = watchStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status" };

  await prisma.$transaction(async (tx) => {
    await tx.watchStatus.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      update: { status: parsed.data },
      create: { userId: user.id, videoId, status: parsed.data },
    });
    playlistIds = await refreshPublicStatsForVideo(tx, videoId);
  });

  revalidatePath(`/watch/${videoId}`);
  revalidatePath(`/shows/${video.showSlug}`);
  for (const playlistId of playlistIds) revalidatePath(`/playlists/${playlistId}`);
  revalidatePath("/my-list");
  return { ok: true };
}
