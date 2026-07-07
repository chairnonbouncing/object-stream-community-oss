"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { reportSchema } from "@/lib/validation";
import { rateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";

export async function submitReport(
  targetType: "video" | "review" | "wiki_page" | "wiki_discussion" | "wiki_image",
  targetId: string,
  reason?: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to report content" };
  if (!rateLimit(`report:${user.id}`, 10, 10 * 60_000)) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  if (
    targetType !== "video" &&
    targetType !== "review" &&
    targetType !== "wiki_page" &&
    targetType !== "wiki_discussion" &&
    targetType !== "wiki_image"
  ) {
    return { ok: false, error: "Invalid report target" };
  }
  const parsedReason = reportSchema.safeParse({ reason });
  if (!parsedReason.success) return { ok: false, error: "Reason is too long" };

  const target =
    targetType === "video"
      ? await prisma.video.findUnique({ where: { id: targetId }, select: { id: true } })
      : targetType === "review"
        ? await prisma.review.findUnique({ where: { id: targetId }, select: { id: true } })
        : targetType === "wiki_discussion"
          ? await prisma.wikiDiscussion.findUnique({ where: { id: targetId }, select: { id: true } })
          : await prisma.wikiPage.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return { ok: false, error: "Content not found" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.create({
        data: {
          reporterId: user.id,
          targetType,
          targetId,
          reason: parsedReason.data.reason ?? null,
        },
      });
      if (targetType === "video") {
        await tx.video.update({
          where: { id: targetId },
          data: { reportCount: { increment: 1 } },
        });
      } else if (targetType === "review") {
        await tx.review.update({
          where: { id: targetId },
          data: { reportCount: { increment: 1 } },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "You already reported this — the mods are on it" };
    }
    throw e;
  }

  return { ok: true, message: "Thanks — a mod will take a look" };
}
