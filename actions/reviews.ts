"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { fieldErrorsFrom, reviewSchema } from "@/lib/validation";
import { refreshPublicStatsForVideo } from "@/lib/public-stats";
import type { ActionResult, FormState } from "@/lib/types";

export type ReviewFormState = (NonNullable<FormState> & { saved?: boolean }) | undefined;

export async function submitReview(
  videoId: string,
  prev: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to write reviews" };

  const parsed = reviewSchema.safeParse({
    text: formData.get("text"),
    rating: formData.get("rating"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isHidden: true, showSlug: true },
  });
  if (!video || video.isHidden) return { error: "Video not found" };

  const { text, rating } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.review.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      update: { text, rating: rating ?? null },
      create: { userId: user.id, videoId, text, rating: rating ?? null },
    });
    if (rating != null) {
      // Star ratings given with a review count toward the aggregate too.
      await tx.rating.upsert({
        where: { userId_videoId: { userId: user.id, videoId } },
        update: { rating },
        create: { userId: user.id, videoId, rating },
      });
    }
    await refreshPublicStatsForVideo(tx, videoId);
  });

  revalidatePath(`/watch/${videoId}`);
  revalidatePath(`/shows/${video.showSlug}`);
  return { saved: true };
}

export async function deleteOwnReview(reviewId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, videoId: true, video: { select: { showSlug: true } } },
  });
  if (!review || review.userId !== user.id) {
    return { ok: false, error: "Not your review" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    // Polymorphic reports have no FK — clean up by hand.
    await tx.report.deleteMany({ where: { targetType: "review", targetId: reviewId } });
    await refreshPublicStatsForVideo(tx, review.videoId);
  });

  revalidatePath(`/watch/${review.videoId}`);
  revalidatePath(`/shows/${review.video.showSlug}`);
  return { ok: true };
}
