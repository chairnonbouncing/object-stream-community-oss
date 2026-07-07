"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { refreshShowStatsBySlug } from "@/lib/public-stats";
import type { ActionResult } from "@/lib/types";

export async function toggleFavoriteShow(
  showSlug: string,
  showTitle: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to favorite shows" };
  if (
    typeof showSlug !== "string" ||
    !showSlug ||
    typeof showTitle !== "string" ||
    !showTitle
  ) {
    return { ok: false, error: "Invalid show" };
  }

  const existing = await prisma.favoriteShow.findUnique({
    where: { userId_showSlug: { userId: user.id, showSlug } },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.favoriteShow.delete({ where: { id: existing.id } });
      await refreshShowStatsBySlug(tx, showSlug);
    });
  } else {
    // Only real, visible shows can be favorited.
    const show = await prisma.video.findFirst({
      where: { showSlug, isHidden: false },
      select: { showTitle: true },
    });
    if (!show) return { ok: false, error: "Show not found" };
    await prisma.$transaction(async (tx) => {
      await tx.favoriteShow.create({
        data: { userId: user.id, showSlug, showTitle: show.showTitle },
      });
      await refreshShowStatsBySlug(tx, showSlug);
    });
  }

  revalidatePath(`/shows/${showSlug}`);
  revalidatePath("/my-list");
  return { ok: true };
}
