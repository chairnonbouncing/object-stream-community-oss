import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseVideoUrl } from "@/lib/video-url";
import { slugify } from "@/lib/slugify";

type Dump = {
  scrapedAt: string;
  videos: Array<{
    liveId: string;
    originalUrl: string | null;
    showTitle: string;
    episodeTitle: string | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    description: string | null;
    genreTags: string;
    language: string;
    releaseYear: number | null;
    status: string;
    thumbnailUrl: string | null;
    viewCount: number;
    isFeatured: boolean;
    isHidden: boolean;
    addedDate: string | null;
    submittedBy: string | null;
    reviews: Array<{
      username: string;
      rating: number | null;
      date: string | null;
      text: string;
    }>;
  }>;
  playlists: Array<{
    liveId: string;
    name: string;
    description: string | null;
    owner: string | null;
    videoLiveIds: string[];
  }>;
  users: Array<{
    username: string;
    bio: string | null;
    avatarUrl: string | null;
    favoriteShows: Array<{ slug: string; title: string }>;
  }>;
};

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function readDump(): Dump | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "backups", "live-dump.json"), "utf8")
    );
  } catch {
    return null;
  }
}

/** Usernames that came from the backup (their passwords were unrecoverable). */
export function restoredUsernames(): string[] {
  return (readDump()?.users ?? []).map((u) => u.username);
}

/**
 * Refills an EMPTY catalog from backups/live-dump.json (created by
 * scripts/scrape-live-site.ts). Used for the SQLite→Postgres migration so the
 * community's submissions survive the move. No-ops when the dump file is
 * absent or the catalog already has videos.
 *
 * Restored accounts get unguessable random passwords — content and
 * attribution survive; owners ask the admin to reissue a login.
 */
export async function restoreFromDump(): Promise<boolean> {
  const dump = readDump();
  if (!dump) return false; // no dump shipped with this build

  if ((await prisma.video.count()) > 0) return false;

  console.log(
    `[restore] empty catalog — restoring dump from ${dump.scrapedAt}: ${dump.videos.length} videos`
  );

  const userIds = new Map<string, string>();
  for (const u of dump.users) {
    const existing = await prisma.user.findUnique({
      where: { username: u.username },
      select: { id: true },
    });
    if (existing) {
      userIds.set(u.username, existing.id);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        username: u.username,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        // Their real password is unrecoverable — sign-in offers a one-time
        // self-service reset so they can reclaim the account themselves.
        mustResetPassword: true,
        bio: u.bio,
        avatarUrl: u.avatarUrl,
      },
      select: { id: true },
    });
    userIds.set(u.username, created.id);
  }

  const videoIds = new Map<string, string>();
  let restored = 0;
  let skipped = 0;
  for (const v of dump.videos) {
    const parsed = parseVideoUrl(v.originalUrl ?? "");
    if (!parsed.ok || !v.showTitle) {
      skipped++;
      continue;
    }
    const created = await prisma.video.upsert({
      where: {
        provider_providerVideoId: {
          provider: parsed.provider,
          providerVideoId: parsed.providerVideoId,
        },
      },
      update: {},
      create: {
        provider: parsed.provider,
        providerVideoId: parsed.providerVideoId,
        originalUrl: v.originalUrl!,
        showTitle: v.showTitle,
        showSlug: slugify(v.showTitle),
        episodeTitle: v.episodeTitle,
        seasonNumber: v.seasonNumber,
        episodeNumber: v.episodeNumber,
        description: v.description,
        genreTags: v.genreTags ?? "",
        language: v.language || "English",
        releaseYear: v.releaseYear,
        status: v.status || "Ongoing",
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount ?? 0,
        isFeatured: v.isFeatured ?? false,
        isHidden: v.isHidden ?? false,
        ...(parseDate(v.addedDate) ? { createdAt: parseDate(v.addedDate) } : {}),
        ...(v.submittedBy && userIds.has(v.submittedBy)
          ? { submittedByUserId: userIds.get(v.submittedBy) }
          : {}),
      },
      select: { id: true },
    });
    videoIds.set(v.liveId, created.id);
    restored++;

    for (const r of v.reviews ?? []) {
      const uid = userIds.get(r.username);
      if (!uid || !r.text) continue;
      await prisma.review.upsert({
        where: { userId_videoId: { userId: uid, videoId: created.id } },
        update: {},
        create: {
          userId: uid,
          videoId: created.id,
          rating: r.rating,
          text: r.text,
          ...(parseDate(r.date) ? { createdAt: parseDate(r.date) } : {}),
        },
      });
      if (r.rating) {
        await prisma.rating.upsert({
          where: { userId_videoId: { userId: uid, videoId: created.id } },
          update: {},
          create: { userId: uid, videoId: created.id, rating: r.rating },
        });
      }
    }
  }

  let playlists = 0;
  for (const p of dump.playlists ?? []) {
    const ownerId = p.owner ? userIds.get(p.owner) : undefined;
    if (!ownerId || !p.name) continue;
    const exists = await prisma.playlist.findFirst({
      where: { userId: ownerId, name: p.name },
      select: { id: true },
    });
    if (exists) continue;
    const items = p.videoLiveIds
      .map((lid, i) => ({ videoId: videoIds.get(lid)!, position: i + 1 }))
      .filter((x) => x.videoId);
    await prisma.playlist.create({
      data: {
        userId: ownerId,
        name: p.name,
        description: p.description,
        isPublic: true,
        items: { create: items },
      },
    });
    playlists++;
  }

  let favorites = 0;
  for (const u of dump.users ?? []) {
    const uid = userIds.get(u.username);
    if (!uid) continue;
    for (const f of u.favoriteShows ?? []) {
      await prisma.favoriteShow.upsert({
        where: { userId_showSlug: { userId: uid, showSlug: f.slug } },
        update: {},
        create: { userId: uid, showSlug: f.slug, showTitle: f.title },
      });
      favorites++;
    }
  }

  console.log(
    `[restore] done: ${restored} videos (${skipped} skipped), ${userIds.size} users, ${playlists} playlists, ${favorites} favorites`
  );
  return true;
}
