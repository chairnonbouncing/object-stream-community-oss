"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { youtubePlaylistImportSchema, fieldErrorsFrom } from "@/lib/validation";
import {
  fetchYouTubePlaylist,
  parseYouTubePlaylistUrl,
  type YouTubePlaylistPreview,
} from "@/lib/youtube-playlists";
import { ensureVideoBaseline, snapshotPlaylist, snapshotVideo } from "@/lib/revisions";
import { ensureEpisodeWikiStub, ensureShow, ensureShowWikiStub } from "@/lib/shows";
import { joinTags } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slugify";
import {
  refreshPlaylistStats,
  refreshPublicStatsForVideos,
  refreshShowStatsById,
} from "@/lib/public-stats";
import type { FormState } from "@/lib/types";

export type ImportPreviewVideo = YouTubePlaylistPreview["videos"][number] & {
  duplicateVideoId?: string;
};

export type ImportState =
  | (NonNullable<FormState> & {
      preview?: Omit<YouTubePlaylistPreview, "videos"> & {
        videos: ImportPreviewVideo[];
      };
      /** Echo of the submitted fields. React 19 resets uncontrolled inputs
       *  after every action — feeding these back as defaultValues is what
       *  keeps the form filled between "preview" and "confirm". */
      form?: {
        playlistUrl: string;
        showTitle: string;
        seasonNumber: string;
        status: string;
        genres: string[];
        extraTags: string;
        language: string;
        releaseYear: string;
        ageRangeTag: string;
      };
    })
  | undefined;

function echoForm(formData: FormData): NonNullable<ImportState>["form"] {
  const s = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v : "";
  };
  return {
    playlistUrl: s("playlistUrl"),
    showTitle: s("showTitle"),
    seasonNumber: s("seasonNumber"),
    status: s("status"),
    genres: formData.getAll("genres").map(String),
    extraTags: s("extraTags"),
    language: s("language"),
    releaseYear: s("releaseYear"),
    ageRangeTag: s("ageRangeTag"),
  };
}

function parseImportForm(formData: FormData) {
  return youtubePlaylistImportSchema.safeParse({
    playlistUrl: formData.get("playlistUrl"),
    showTitle: formData.get("showTitle"),
    seasonNumber: formData.get("seasonNumber"),
    status: formData.get("status") || "Ongoing",
    genres: formData.getAll("genres"),
    extraTags: formData.get("extraTags"),
    language: formData.get("language") || "English",
    releaseYear: formData.get("releaseYear"),
    ageRangeTag: formData.get("ageRangeTag") || "Unknown",
  });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function previewFor(playlistId: string): Promise<ImportState> {
  const fetched = await fetchYouTubePlaylist(playlistId);
  if (!fetched.ok) return { error: fetched.error };
  const existing = await prisma.video.findMany({
    where: {
      provider: "youtube",
      providerVideoId: { in: fetched.playlist.videos.map((v) => v.providerVideoId) },
    },
    select: { id: true, providerVideoId: true },
  });
  const byProviderId = new Map(existing.map((v) => [v.providerVideoId, v.id]));
  return {
    preview: {
      ...fetched.playlist,
      videos: fetched.playlist.videos.map((video) => ({
        ...video,
        // The preview UI clamps descriptions to two lines, and this whole
        // object round-trips through the action state on confirm — keep the
        // payload light for 100-video playlists. Confirm refetches full data.
        description: video.description ? video.description.slice(0, 300) : null,
        ...(byProviderId.get(video.providerVideoId)
          ? { duplicateVideoId: byProviderId.get(video.providerVideoId) }
          : {}),
      })),
    },
  };
}

export async function importYoutubePlaylist(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to import playlists" };

  const form = echoForm(formData);
  const parsed = parseImportForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), form };

  const playlistUrl = parseYouTubePlaylistUrl(parsed.data.playlistUrl);
  if (!playlistUrl.ok) {
    return { fieldErrors: { playlistUrl: [playlistUrl.error] }, form };
  }

  const intent = formData.get("intent");
  if (intent !== "confirm") {
    // Previews hit the YouTube Data API (quota) — keep enthusiasm in check.
    if (!rateLimit(`import-preview:${user.id}`, 12, 10 * 60_000)) {
      return { error: "Too many previews — wait a few minutes and try again.", form };
    }
    const preview = await previewFor(playlistUrl.playlistId);
    return { ...preview, form };
  }

  // A confirmed import is a long transaction with hundreds of writes.
  if (!rateLimit(`import-confirm:${user.id}`, 6, 60 * 60_000)) {
    return { error: "Import limit reached — try again in an hour.", form };
  }

  const fetched = await fetchYouTubePlaylist(playlistUrl.playlistId);
  if (!fetched.ok) return { error: fetched.error, form };

  const selected = new Set(
    formData
      .getAll("selectedVideoIds")
      .map(String)
      .filter(Boolean)
  );
  if (selected.size === 0) {
    return { error: "Select at least one video to import", form };
  }
  const updateMetadataIds = user.isAdmin
    ? new Set(formData.getAll("updateMetadataIds").map(String))
    : new Set<string>();
  const videos = fetched.playlist.videos.filter((v) => selected.has(v.providerVideoId));
  if (videos.length === 0) {
    return { error: "Selected videos were not found in the playlist", form };
  }

  const genreTags = joinTags([
    ...parsed.data.genres,
    ...(parsed.data.extraTags ? parsed.data.extraTags.split(",") : []),
  ]);
  let playlistId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const show = await ensureShow(tx, {
        title: parsed.data.showTitle,
        description: fetched.playlist.description,
        status: parsed.data.status,
        genreTags,
        language: parsed.data.language,
        releaseYear: parsed.data.releaseYear ?? null,
        ageRangeTag: parsed.data.ageRangeTag,
        coverImageUrl: videos[0]?.thumbnailUrl ?? null,
        addedByUserId: user.id,
      });
      await ensureShowWikiStub(tx, show, user.id);

      const existing = await tx.video.findMany({
        where: {
          provider: "youtube",
          providerVideoId: { in: videos.map((v) => v.providerVideoId) },
        },
      });
      const existingByProviderId = new Map(existing.map((v) => [v.providerVideoId, v]));
      const importedVideoIds: string[] = [];
      let importedCount = 0;
      let skippedDuplicateCount = 0;

      for (const item of videos) {
        const duplicate = existingByProviderId.get(item.providerVideoId);
        if (duplicate) {
          skippedDuplicateCount++;
          importedVideoIds.push(duplicate.id);
          if (updateMetadataIds.has(item.providerVideoId)) {
            await ensureVideoBaseline(tx, duplicate);
            const updated = await tx.video.update({
              where: { id: duplicate.id },
              data: {
                showId: show.id,
                showTitle: parsed.data.showTitle,
                showSlug: slugify(parsed.data.showTitle),
                episodeTitle: item.title,
                seasonNumber: parsed.data.seasonNumber ?? null,
                episodeNumber: item.position,
                description: item.description,
                ageRangeTag: parsed.data.ageRangeTag,
                genreTags,
                language: parsed.data.language,
                releaseYear: parsed.data.releaseYear ?? null,
                status: parsed.data.status,
                thumbnailUrl: item.thumbnailUrl,
                channelTitle: item.channelTitle,
                publishedAt: parseDate(item.publishedAt),
                youtubePlaylistId: fetched.playlist.playlistId,
                playlistPosition: item.position,
                runtimeSeconds: item.runtimeSeconds,
              },
            });
            await snapshotVideo(tx, updated, user.id, "metadata refreshed from YouTube playlist import");
          }
          continue;
        }

        const created = await tx.video.create({
          data: {
            provider: "youtube",
            providerVideoId: item.providerVideoId,
            originalUrl: item.originalUrl,
            showId: show.id,
            showTitle: parsed.data.showTitle,
            showSlug: slugify(parsed.data.showTitle),
            episodeTitle: item.title,
            seasonNumber: parsed.data.seasonNumber ?? null,
            episodeNumber: item.position,
            description: item.description,
            ageRangeTag: parsed.data.ageRangeTag,
            genreTags,
            language: parsed.data.language,
            releaseYear: parsed.data.releaseYear ?? null,
            status: parsed.data.status,
            thumbnailUrl: item.thumbnailUrl,
            channelTitle: item.channelTitle,
            publishedAt: parseDate(item.publishedAt),
            youtubePlaylistId: fetched.playlist.playlistId,
            playlistPosition: item.position,
            runtimeSeconds: item.runtimeSeconds,
            submittedByUserId: user.id,
          },
        });
        importedCount++;
        importedVideoIds.push(created.id);
        await ensureEpisodeWikiStub(tx, created, user.id);
      }

      const playlist = await tx.playlist.create({
        data: {
          userId: user.id,
          name: `${parsed.data.showTitle} - ${fetched.playlist.title}`,
          description: fetched.playlist.description,
          isPublic: true,
        },
        select: { id: true },
      });
      playlistId = playlist.id;

      const seen = new Set<string>();
      const playlistItems = importedVideoIds
        .filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((videoId, index) => ({ playlistId, videoId, position: index + 1 }));
      if (playlistItems.length > 0) {
        await tx.playlistItem.createMany({ data: playlistItems });
      }
      await snapshotPlaylist(tx, playlistId, user.id, { note: "created from YouTube playlist import" });
      await refreshPublicStatsForVideos(tx, importedVideoIds);
      await refreshShowStatsById(tx, show.id);
      await refreshPlaylistStats(tx, playlistId);

      await tx.playlistImport.create({
        data: {
          userId: user.id,
          youtubePlaylistId: fetched.playlist.playlistId,
          playlistTitle: fetched.playlist.title,
          playlistDescription: fetched.playlist.description,
          channelTitle: fetched.playlist.channelTitle,
          videoCount: fetched.playlist.videos.length,
          importedCount,
          skippedDuplicateCount,
          status: "completed",
        },
      });
      // A 100-video import runs ~1000 queries — far past the 5s default
      // interactive-transaction budget on a remote database.
    }, { timeout: 120_000, maxWait: 10_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error: "A duplicate was detected during import. Refresh the preview and try again.",
        form,
      };
    }
    console.error("[import] transaction failed:", e);
    throw e;
  }

  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/shows");
  revalidatePath("/playlists");
  revalidatePath("/wiki");
  revalidatePath("/admin/imports");
  redirect(`/playlists/${playlistId}`);
}
