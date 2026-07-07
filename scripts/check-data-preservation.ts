import { prisma } from "@/lib/prisma";
import { ensureExpansionSchema } from "@/lib/bootstrap-db";
import { backfillShowsAndWiki } from "@/lib/shows";
import { backfillPublicStats } from "@/lib/public-stats";

async function snapshot() {
  const [users, videos, playlists, reviews, ratings, watchStatuses] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true, username: true, email: true, isAdmin: true },
    }),
    prisma.video.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        provider: true,
        providerVideoId: true,
        submittedByUserId: true,
      },
    }),
    prisma.playlist.findMany({
      orderBy: { id: "asc" },
      select: { id: true, userId: true, isPublic: true },
    }),
    prisma.review.findMany({
      orderBy: { id: "asc" },
      select: { id: true, userId: true, videoId: true, rating: true, isHidden: true },
    }),
    prisma.rating.findMany({
      orderBy: { id: "asc" },
      select: { id: true, userId: true, videoId: true, rating: true },
    }),
    prisma.watchStatus.findMany({
      orderBy: { id: "asc" },
      select: { id: true, userId: true, videoId: true, status: true },
    }),
  ]);
  return { users, videos, playlists, reviews, ratings, watchStatuses };
}

function assertSame(label: string, before: unknown, after: unknown) {
  const a = JSON.stringify(before);
  const b = JSON.stringify(after);
  if (a !== b) {
    throw new Error(`${label} changed during additive show/wiki backfill`);
  }
}

async function main() {
  await ensureExpansionSchema();
  const before = await snapshot();
  await backfillShowsAndWiki();
  await backfillPublicStats();
  const after = await snapshot();

  assertSame("User identities", before.users, after.users);
  assertSame("Video identities", before.videos, after.videos);
  assertSame("Playlist identities", before.playlists, after.playlists);
  assertSame("Review identities", before.reviews, after.reviews);
  assertSame("Rating identities", before.ratings, after.ratings);
  assertSame("Watch status identities", before.watchStatuses, after.watchStatuses);
  console.log(
    `[preservation] ok: ${after.users.length} users, ${after.videos.length} videos, ${after.playlists.length} playlists preserved`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
