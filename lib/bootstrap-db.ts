import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DDL } from "@/lib/generated/ddl";
import { restoreFromDump, restoredUsernames } from "@/lib/restore-dump";
import { backfillShowsAndWiki } from "@/lib/shows";
import { backfillPublicStats } from "@/lib/public-stats";

/**
 * Makes a fresh database usable without the Prisma CLI: creates the schema
 * if the tables are missing, ensures the admin account exists, and refills an
 * empty catalog from the shipped backup dump if one exists. Runs once per
 * server start (see instrumentation.ts) — hosts like Render/Wasmer may force
 * their own start command, so the app can't rely on
 * `prisma migrate deploy && prisma db seed` running first.
 *
 * Supports SQLite (file:) and Postgres (postgres://) — the DDL is regenerated
 * for the active provider at build time by scripts/generate-ddl.mjs.
 */
export async function ensureDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const isSqlite = url.startsWith("file:");
  const isPostgres = url.startsWith("postgres");
  if (!isSqlite && !isPostgres) return;

  const tables = isSqlite
    ? await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='User'"
      )
    : await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT table_name as name FROM information_schema.tables WHERE table_name = 'User' AND table_schema = current_schema()"
      );

  let needsStartupBackfill = tables.length === 0;
  if (tables.length === 0) {
    console.log("[bootstrap] empty database — creating schema");
    const statements = DDL.split(";")
      .map((s) =>
        s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim()
      )
      .filter(Boolean);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    console.log(`[bootstrap] schema created (${statements.length} statements)`);
  }

  // Tiny forward-migration for databases created before this column existed.
  // Must run before any prisma.user query (the generated client selects it).
  const hasResetColumn = isSqlite
    ? await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM pragma_table_info('User') WHERE name='mustResetPassword'"
      )
    : await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT column_name as name FROM information_schema.columns WHERE table_name='User' AND column_name='mustResetPassword' AND table_schema = current_schema()"
      );
  if (hasResetColumn.length === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN "mustResetPassword" BOOLEAN NOT NULL DEFAULT false`
    );
    // One-time backfill: accounts that came from the backup restore have
    // unrecoverable passwords — flag them so sign-in offers the reset flow.
    const dumpUsernames = restoredUsernames();
    if (dumpUsernames.length > 0) {
      const admin = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
      const flagged = await prisma.user.updateMany({
        where: { username: { in: dumpUsernames.filter((u) => u !== admin) } },
        data: { mustResetPassword: true },
      });
      console.log(
        `[bootstrap] added mustResetPassword; flagged ${flagged.count} restored accounts for self-service reset`
      );
    }
  }

  if (isPostgres) {
    needsStartupBackfill =
      needsStartupBackfill || (await needsExpansionBackfill());
    await ensureExpansionSchema();
    // Repair summaries that captured a leaked "@@OSC_WIKI_BLOCK_n@@" renderer
    // token before the summary extraction learned to skip tokenized lines.
    // Idempotent: matches nothing once clean.
    await prisma.$executeRawUnsafe(
      `UPDATE "WikiPage" SET "summary" = NULLIF(btrim(regexp_replace("summary", '@@OSC_WIKI_BLOCK_[0-9]+@@', '', 'g')), '') WHERE "summary" LIKE '%@@OSC_WIKI_BLOCK%'`
    );
    const missingShowLinks = await prisma.video.count({
      where: { showId: null },
    });
    if (needsStartupBackfill || missingShowLinks > 0) {
      // Run behind boot, not on it: backfills walk the whole catalog and
      // would otherwise stretch every cold start and hammer the DB while
      // the first requests are already arriving.
      void (async () => {
        await backfillShowsAndWiki();
        await backfillPublicStats();
        console.log("[bootstrap] background backfill complete");
      })().catch((e) => console.error("[bootstrap] background backfill failed:", e));
    }
  }

  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    if (!existing.isAdmin) {
      await prisma.user.update({ where: { username }, data: { isAdmin: true } });
    }
  } else if (!password) {
    console.warn(
      "[bootstrap] ADMIN_PASSWORD not set — no admin account created. Set it and restart."
    );
  } else {
    await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        isAdmin: true,
        bio: "Keeping the catalog clean. Report anything weird and I'll take a look!",
      },
    });
    console.log(`[bootstrap] admin account created: ${username}`);
  }

  // Refill an empty catalog from the shipped backup (no-op when absent/filled).
  const restored = await restoreFromDump();
  if (isPostgres && restored) {
    await backfillShowsAndWiki();
    await backfillPublicStats();
  }
}

async function pgColumnExists(tableName: string, columnName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT column_name as name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 AND table_schema = current_schema()",
    tableName,
    columnName
  );
  return rows.length > 0;
}

async function pgAddColumn(tableName: string, columnName: string, definition: string) {
  if (await pgColumnExists(tableName, columnName)) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`
  );
}

async function needsExpansionBackfill() {
  const requiredColumns: Array<[string, string]> = [
    ["Video", "showId"],
    ["Video", "markedWatchedCount"],
    ["Video", "estimatedSecondsWatched"],
    ["Video", "playlistAddCount"],
    ["Video", "reviewCount"],
    ["Video", "averageRating"],
    ["Playlist", "totalRuntimeSeconds"],
    ["Playlist", "markedWatchedCount"],
    ["Show", "id"],
    ["WikiPage", "id"],
    ["WikiRevision", "id"],
  ];
  for (const [tableName, columnName] of requiredColumns) {
    if (!(await pgColumnExists(tableName, columnName))) return true;
  }
  return false;
}

export async function ensureExpansionSchema() {
  await pgAddColumn("Video", "showId", "TEXT");
  await pgAddColumn("Video", "ageRangeTag", "TEXT NOT NULL DEFAULT 'Unknown'");
  await pgAddColumn("Video", "channelTitle", "TEXT");
  await pgAddColumn("Video", "publishedAt", "TIMESTAMP(3)");
  await pgAddColumn("Video", "youtubePlaylistId", "TEXT");
  await pgAddColumn("Video", "playlistPosition", "INTEGER");
  await pgAddColumn("Video", "runtimeSeconds", "INTEGER");
  await pgAddColumn("Video", "markedWatchedCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Video", "estimatedSecondsWatched", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Video", "playlistAddCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Video", "reviewCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Video", "averageRating", "DOUBLE PRECISION NOT NULL DEFAULT 0");

  await pgAddColumn("Playlist", "viewCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Playlist", "followerCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Playlist", "totalRuntimeSeconds", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Playlist", "markedWatchedCount", "INTEGER NOT NULL DEFAULT 0");

  await pgAddColumn("VideoRevision", "ageRangeTag", "TEXT NOT NULL DEFAULT 'Unknown'");
  await pgAddColumn("VideoRevision", "channelTitle", "TEXT");
  await pgAddColumn("VideoRevision", "publishedAt", "TIMESTAMP(3)");
  await pgAddColumn("VideoRevision", "youtubePlaylistId", "TEXT");
  await pgAddColumn("VideoRevision", "playlistPosition", "INTEGER");
  await pgAddColumn("VideoRevision", "runtimeSeconds", "INTEGER");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Show" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'Ongoing',
      "genreTags" TEXT NOT NULL DEFAULT '',
      "language" TEXT NOT NULL DEFAULT 'English',
      "releaseYear" INTEGER,
      "ageRangeTag" TEXT NOT NULL DEFAULT 'Unknown',
      "coverImageUrl" TEXT,
      "bannerImageUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "addedByUserId" TEXT,
      "isUpcoming" BOOLEAN NOT NULL DEFAULT false,
      "expectedReleaseDate" TIMESTAMP(3),
      "isHidden" BOOLEAN NOT NULL DEFAULT false,
      "viewCount" INTEGER NOT NULL DEFAULT 0,
      "totalMarkedWatchedCount" INTEGER NOT NULL DEFAULT 0,
      "estimatedSecondsWatched" INTEGER NOT NULL DEFAULT 0,
      "followerCount" INTEGER NOT NULL DEFAULT 0,
      "reviewCount" INTEGER NOT NULL DEFAULT 0,
      "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
      CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
    )
  `);
  await pgAddColumn("Show", "viewCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Show", "totalMarkedWatchedCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Show", "estimatedSecondsWatched", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Show", "followerCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Show", "reviewCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("Show", "averageRating", "DOUBLE PRECISION NOT NULL DEFAULT 0");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlaylistImport" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "youtubePlaylistId" TEXT NOT NULL,
      "playlistTitle" TEXT NOT NULL,
      "playlistDescription" TEXT,
      "channelTitle" TEXT,
      "videoCount" INTEGER NOT NULL,
      "importedCount" INTEGER NOT NULL,
      "skippedDuplicateCount" INTEGER NOT NULL,
      "status" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlaylistImport_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiPage" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "pageType" TEXT NOT NULL DEFAULT 'Other',
      "relatedShowId" TEXT,
      "relatedVideoId" TEXT,
      "contentWikitext" TEXT NOT NULL DEFAULT '',
      "renderedHtml" TEXT NOT NULL DEFAULT '',
      "summary" TEXT,
      "mainImageUrl" TEXT,
      "infoboxDataJson" TEXT,
      "categories" TEXT NOT NULL DEFAULT '',
      "createdByUserId" TEXT,
      "lastEditedByUserId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "isProtected" BOOLEAN NOT NULL DEFAULT false,
      "isHidden" BOOLEAN NOT NULL DEFAULT false,
      "viewCount" INTEGER NOT NULL DEFAULT 0,
      "editCount" INTEGER NOT NULL DEFAULT 0,
      "revisionCount" INTEGER NOT NULL DEFAULT 0,
      "watcherCount" INTEGER NOT NULL DEFAULT 0,
      "lastEditedAt" TIMESTAMP(3),
      CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
    )
  `);
  await pgAddColumn("WikiPage", "viewCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("WikiPage", "editCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("WikiPage", "revisionCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("WikiPage", "watcherCount", "INTEGER NOT NULL DEFAULT 0");
  await pgAddColumn("WikiPage", "lastEditedAt", "TIMESTAMP(3)");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiRevision" (
      "id" TEXT NOT NULL,
      "wikiPageId" TEXT NOT NULL,
      "editorUserId" TEXT,
      "contentWikitext" TEXT NOT NULL,
      "renderedHtml" TEXT NOT NULL,
      "editSummary" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WikiRevision_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiDiscussion" (
      "id" TEXT NOT NULL,
      "wikiPageId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "isHidden" BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "WikiDiscussion_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiCategory" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "description" TEXT,
      CONSTRAINT "WikiCategory_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiPageCategory" (
      "id" TEXT NOT NULL,
      "wikiPageId" TEXT NOT NULL,
      "categoryId" TEXT NOT NULL,
      CONSTRAINT "WikiPageCategory_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlaylistFollow" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "playlistId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlaylistFollow_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WikiPageWatch" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "wikiPageId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WikiPageWatch_pkey" PRIMARY KEY ("id")
    )
  `);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "Show_slug_key" ON "Show"("slug")`,
    `CREATE INDEX IF NOT EXISTS "Show_status_idx" ON "Show"("status")`,
    `CREATE INDEX IF NOT EXISTS "Show_ageRangeTag_idx" ON "Show"("ageRangeTag")`,
    `CREATE INDEX IF NOT EXISTS "Show_isUpcoming_idx" ON "Show"("isUpcoming")`,
    `CREATE INDEX IF NOT EXISTS "Video_showId_idx" ON "Video"("showId")`,
    `CREATE INDEX IF NOT EXISTS "Video_ageRangeTag_idx" ON "Video"("ageRangeTag")`,
    `CREATE INDEX IF NOT EXISTS "Video_markedWatchedCount_idx" ON "Video"("markedWatchedCount")`,
    `CREATE INDEX IF NOT EXISTS "Video_averageRating_idx" ON "Video"("averageRating")`,
    `CREATE INDEX IF NOT EXISTS "Video_youtubePlaylistId_idx" ON "Video"("youtubePlaylistId")`,
    `CREATE INDEX IF NOT EXISTS "PlaylistImport_userId_createdAt_idx" ON "PlaylistImport"("userId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "PlaylistImport_youtubePlaylistId_idx" ON "PlaylistImport"("youtubePlaylistId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WikiPage_slug_key" ON "WikiPage"("slug")`,
    `CREATE INDEX IF NOT EXISTS "WikiPage_pageType_idx" ON "WikiPage"("pageType")`,
    `CREATE INDEX IF NOT EXISTS "WikiPage_relatedShowId_idx" ON "WikiPage"("relatedShowId")`,
    `CREATE INDEX IF NOT EXISTS "WikiPage_relatedVideoId_idx" ON "WikiPage"("relatedVideoId")`,
    `CREATE INDEX IF NOT EXISTS "WikiPage_viewCount_idx" ON "WikiPage"("viewCount")`,
    `CREATE INDEX IF NOT EXISTS "WikiRevision_wikiPageId_createdAt_idx" ON "WikiRevision"("wikiPageId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "WikiDiscussion_wikiPageId_createdAt_idx" ON "WikiDiscussion"("wikiPageId", "createdAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WikiCategory_slug_key" ON "WikiCategory"("slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WikiPageCategory_wikiPageId_categoryId_key" ON "WikiPageCategory"("wikiPageId", "categoryId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistFollow_userId_playlistId_key" ON "PlaylistFollow"("userId", "playlistId")`,
    `CREATE INDEX IF NOT EXISTS "PlaylistFollow_playlistId_idx" ON "PlaylistFollow"("playlistId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WikiPageWatch_userId_wikiPageId_key" ON "WikiPageWatch"("userId", "wikiPageId")`,
    `CREATE INDEX IF NOT EXISTS "WikiPageWatch_wikiPageId_idx" ON "WikiPageWatch"("wikiPageId")`,
  ];
  for (const statement of indexes) await prisma.$executeRawUnsafe(statement);
}
