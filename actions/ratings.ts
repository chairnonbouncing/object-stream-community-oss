"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { ratingSchema } from "@/lib/validation";
import { refreshPublicStatsForVideo } from "@/lib/public-stats";
import type { ActionResult } from "@/lib/types";

export async function rateVideo(videoId: string, rating: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to rate videos" };

  const parsed = ratingSchema.safeParse(rating);
  if (!parsed.success) return { ok: false, error: "Rating must be 1–5 stars" };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isHidden: true, showSlug: true },
  });
  if (!video || video.isHidden) return { ok: false, error: "Video not found" };

  await prisma.$transaction(async (tx) => {
    await tx.rating.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      update: { rating: parsed.data },
      create: { userId: user.id, videoId, rating: parsed.data },
    });
    await refreshPublicStatsForVideo(tx, videoId);
  });

  revalidatePath(`/watch/${videoId}`);
  revalidatePath(`/shows/${video.showSlug}`);
  return { ok: true };
}
