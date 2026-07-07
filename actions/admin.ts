"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth-helpers";
import {
  refreshPlaylistStats,
  refreshPublicStatsForVideo,
  refreshShowStatsBySlug,
} from "@/lib/public-stats";
import type { ActionResult } from "@/lib/types";

const NOT_ADMIN = { ok: false, error: "Not authorized" } as const;

/** Admin edits touch listings everywhere — refresh the catalog surfaces. */
function revalidateCatalog(videoId?: string, showSlug?: string) {
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/shows");
  if (showSlug) revalidatePath(`/shows/${showSlug}`);
  if (videoId) revalidatePath(`/watch/${videoId}`);
  revalidatePath("/admin/videos");
}

// Metadata editing is community-wide now (updateVideo in actions/videos.ts,
// with version history); admins keep hide/feature/delete and review/report powers.

export async function adminSetVideoHidden(
  videoId: string,
  hidden: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const video = await prisma.$transaction(async (tx) => {
    const row = await tx.video.update({
      where: { id: videoId },
      data: { isHidden: hidden },
      select: { id: true, showSlug: true },
    });
    await refreshPublicStatsForVideo(tx, row.id);
    return row;
  });
  revalidateCatalog(videoId, video.showSlug);
  return { ok: true };
}

export async function adminSetFeatured(
  videoId: string,
  featured: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  await prisma.video.update({
    where: { id: videoId },
    data: { isFeatured: featured },
  });
  revalidatePath("/");
  revalidatePath("/admin/videos");
  return { ok: true };
}

export async function adminDeleteVideo(videoId: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      showSlug: true,
      reviews: { select: { id: true } },
      playlistItems: { select: { playlistId: true } },
    },
  });
  if (!video) return { ok: false, error: "Video not found" };

  const playlistIds = [...new Set(video.playlistItems.map((item) => item.playlistId))];
  await prisma.$transaction(async (tx) => {
    await tx.video.delete({ where: { id: videoId } });
    // Reviews cascade with the video; their reports (and the video's) don't.
    await tx.report.deleteMany({
      where: {
        OR: [
          { targetType: "video", targetId: videoId },
          { targetType: "review", targetId: { in: video.reviews.map((r) => r.id) } },
        ],
      },
    });
    await refreshShowStatsBySlug(tx, video.showSlug);
    for (const playlistId of playlistIds) await refreshPlaylistStats(tx, playlistId);
  });

  revalidateCatalog(videoId, video.showSlug);
  for (const playlistId of playlistIds) revalidatePath(`/playlists/${playlistId}`);
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function adminSetReviewHidden(
  reviewId: string,
  hidden: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const review = await prisma.$transaction(async (tx) => {
    const row = await tx.review.update({
      where: { id: reviewId },
      data: { isHidden: hidden },
      select: { videoId: true, video: { select: { showSlug: true } } },
    });
    await refreshPublicStatsForVideo(tx, row.videoId);
    return row;
  });
  revalidatePath(`/watch/${review.videoId}`);
  revalidatePath(`/shows/${review.video.showSlug}`);
  revalidatePath("/admin/reviews");
  return { ok: true };
}

export async function adminDeleteReview(reviewId: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { videoId: true, video: { select: { showSlug: true } } },
  });
  if (!review) return { ok: false, error: "Review not found" };

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    await tx.report.deleteMany({ where: { targetType: "review", targetId: reviewId } });
    await refreshPublicStatsForVideo(tx, review.videoId);
  });

  revalidatePath(`/watch/${review.videoId}`);
  revalidatePath(`/shows/${review.video.showSlug}`);
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/reports");
  return { ok: true };
}

/**
 * Issues a one-time temporary password (shown only to the admin, who passes
 * it to the user out-of-band). Exists mainly for accounts restored from the
 * SQLite backup, whose original passwords were unrecoverable.
 */
export async function adminSetTempPassword(userId: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) return { ok: false, error: "User not found" };

  const { randomBytes } = await import("node:crypto");
  const bcrypt = (await import("bcryptjs")).default;
  // Readable but unguessable: osc-xxxxxxxx-xxxx
  const temp = `osc-${randomBytes(4).toString("hex")}-${randomBytes(2).toString("hex")}`;
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(temp, 10) },
  });

  return {
    ok: true,
    message: `Temp password for @${user.username}: ${temp} — tell them to change it right away in Edit Profile`,
  };
}

export async function adminDismissReport(reportId: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return NOT_ADMIN;

  const dismissed = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report) return false;
    await tx.report.delete({ where: { id: reportId } });
    const remaining = await tx.report.count({
      where: { targetType: report.targetType, targetId: report.targetId },
    });
    if (report.targetType === "video") {
      await tx.video.updateMany({
        where: { id: report.targetId },
        data: { reportCount: remaining },
      });
    } else if (report.targetType === "review") {
      await tx.review.updateMany({
        where: { id: report.targetId },
        data: { reportCount: remaining },
      });
    }
    return true;
  });

  if (!dismissed) return { ok: false, error: "Report not found" };
  revalidatePath("/admin/reports");
  return { ok: true };
}
