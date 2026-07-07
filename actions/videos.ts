"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { fetchOEmbed } from "@/lib/oembed";
import { fetchProviderVideoInfo } from "@/lib/provider-metadata";
import { fieldErrorsFrom, submitVideoSchema, videoEditSchema } from "@/lib/validation";
import { parseVideoUrl, youtubeThumbnailUrl, type VideoProvider } from "@/lib/video-url";
import { ensureVideoBaseline, snapshotVideo } from "@/lib/revisions";
import { joinTags, formatDate } from "@/lib/format";
import { slugify } from "@/lib/slugify";
import { ensureShow, ensureShowWikiStub } from "@/lib/shows";
import {
  refreshPublicStatsForVideo,
  refreshShowStatsBySlug,
} from "@/lib/public-stats";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { ActionResult, FormState } from "@/lib/types";

export type SubmitState = (NonNullable<FormState> & { duplicateVideoId?: string }) | undefined;

export type UrlPreview =
  | {
      ok: true;
      provider: VideoProvider;
      providerVideoId: string;
      suggestedTitle: string | null;
      description: string | null;
      thumbnailUrl: string | null;
      authorName: string | null;
      publishedAt: string | null;
      runtimeSeconds: number | null;
      setupNote?: string;
      duplicateVideoId?: string;
    }
  | { ok: false; error: string };

/** Powers the live preview on the submit form. */
export async function getUrlPreview(url: string): Promise<UrlPreview> {
  if (typeof url !== "string" || url.length > 500) {
    return { ok: false, error: "Invalid URL" };
  }
  // Each preview is a remote oEmbed fetch on our dime — cap per IP.
  if (!rateLimit(`url-preview:${await clientIp()}`, 30, 10 * 60_000)) {
    return { ok: false, error: "Too many previews — wait a bit and try again." };
  }
  const parsed = parseVideoUrl(url);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const [existing, oembed] = await Promise.all([
    prisma.video.findUnique({
      where: {
        provider_providerVideoId: {
          provider: parsed.provider,
          providerVideoId: parsed.providerVideoId,
        },
      },
      select: { id: true },
    }),
    fetchOEmbed(parsed.provider, parsed.canonicalUrl),
  ]);

  return {
    ok: true,
    provider: parsed.provider,
    providerVideoId: parsed.providerVideoId,
    suggestedTitle: oembed?.title ?? null,
    description: null,
    thumbnailUrl:
      oembed?.thumbnailUrl ??
      (parsed.provider === "youtube" ? youtubeThumbnailUrl(parsed.providerVideoId) : null),
    authorName: oembed?.authorName ?? null,
    publishedAt: null,
    runtimeSeconds: oembed?.runtimeSeconds ?? null,
    ...(existing ? { duplicateVideoId: existing.id } : {}),
  };
}

export async function fetchVideoInfo(url: string): Promise<UrlPreview> {
  if (typeof url !== "string" || url.length > 500) {
    return { ok: false, error: "Invalid URL" };
  }
  if (!rateLimit(`video-info:${await clientIp()}`, 30, 10 * 60_000)) {
    return { ok: false, error: "Too many lookups — wait a bit and try again." };
  }
  const result = await fetchProviderVideoInfo(url);
  if (!result.ok) return { ok: false, error: result.error };
  const existing = await prisma.video.findUnique({
    where: {
      provider_providerVideoId: {
        provider: result.info.provider,
        providerVideoId: result.info.providerVideoId,
      },
    },
    select: { id: true },
  });
  return {
    ok: true,
    provider: result.info.provider,
    providerVideoId: result.info.providerVideoId,
    suggestedTitle: result.info.title,
    description: result.info.description,
    thumbnailUrl: result.info.thumbnailUrl,
    authorName: result.info.channelTitle,
    publishedAt: result.info.publishedAt,
    runtimeSeconds: result.info.runtimeSeconds,
    setupNote: result.info.setupNote,
    ...(existing ? { duplicateVideoId: existing.id } : {}),
  };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function submitVideo(
  prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to submit videos" };

  const parsed = submitVideoSchema.safeParse({
    url: formData.get("url"),
    showTitle: formData.get("showTitle"),
    episodeTitle: formData.get("episodeTitle"),
    seasonNumber: formData.get("seasonNumber"),
    episodeNumber: formData.get("episodeNumber"),
    description: formData.get("description"),
    ageRangeTag: formData.get("ageRangeTag") || "Unknown",
    genres: formData.getAll("genres"),
    extraTags: formData.get("extraTags"),
    language: formData.get("language"),
    releaseYear: formData.get("releaseYear"),
    status: formData.get("status"),
    thumbnailUrl: formData.get("thumbnailUrl"),
    channelTitle: formData.get("channelTitle"),
    publishedAt: formData.get("publishedAt"),
    runtimeSeconds: formData.get("runtimeSeconds"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const urlParsed = parseVideoUrl(parsed.data.url);
  if (!urlParsed.ok) return { fieldErrors: { url: [urlParsed.error] } };

  const uniqueKey = {
    provider: urlParsed.provider,
    providerVideoId: urlParsed.providerVideoId,
  };

  const dupe = await prisma.video.findUnique({
    where: { provider_providerVideoId: uniqueKey },
    select: { id: true },
  });
  if (dupe) {
    return { error: "This video is already in the catalog!", duplicateVideoId: dupe.id };
  }

  const info = await fetchProviderVideoInfo(parsed.data.url);
  const oembed = info.ok
    ? null
    : await fetchOEmbed(urlParsed.provider, urlParsed.canonicalUrl);

  const genreTags = joinTags([
    ...parsed.data.genres,
    ...(parsed.data.extraTags ? parsed.data.extraTags.split(",") : []),
  ]);

  let videoId: string;
  try {
    const video = await prisma.$transaction(async (tx) => {
      const show = await ensureShow(tx, {
        title: parsed.data.showTitle,
        status: parsed.data.status,
        genreTags,
        language: parsed.data.language,
        releaseYear: parsed.data.releaseYear ?? null,
        ageRangeTag: parsed.data.ageRangeTag,
        coverImageUrl:
          parsed.data.thumbnailUrl ??
          (info.ok ? info.info.thumbnailUrl : oembed?.thumbnailUrl) ??
          null,
        addedByUserId: user.id,
      });
      await ensureShowWikiStub(tx, show, user.id);
      const created = await tx.video.create({
        data: {
          ...uniqueKey,
          originalUrl: urlParsed.canonicalUrl,
          showId: show.id,
          showTitle: parsed.data.showTitle,
          showSlug: slugify(parsed.data.showTitle),
          episodeTitle:
            parsed.data.episodeTitle ??
            (info.ok ? info.info.title : oembed?.title) ??
            null,
          seasonNumber: parsed.data.seasonNumber ?? null,
          episodeNumber: parsed.data.episodeNumber ?? null,
          description:
            parsed.data.description ??
            (info.ok ? info.info.description : null) ??
            null,
          ageRangeTag: parsed.data.ageRangeTag,
          genreTags,
          language: parsed.data.language,
          releaseYear: parsed.data.releaseYear ?? null,
          status: parsed.data.status,
          thumbnailUrl:
            parsed.data.thumbnailUrl ??
            (info.ok ? info.info.thumbnailUrl : oembed?.thumbnailUrl) ??
            null,
          channelTitle:
            parsed.data.channelTitle ??
            (info.ok ? info.info.channelTitle : oembed?.authorName) ??
            null,
          publishedAt:
            parseDate(parsed.data.publishedAt) ??
            parseDate(info.ok ? info.info.publishedAt ?? undefined : undefined),
          runtimeSeconds:
            parsed.data.runtimeSeconds ??
            (info.ok ? info.info.runtimeSeconds : oembed?.runtimeSeconds) ??
            null,
          submittedByUserId: user.id,
        },
        select: { id: true },
      });
      await refreshPublicStatsForVideo(tx, created.id);
      return created;
    });
    videoId = video.id;
  } catch (e) {
    // Unique-constraint race: someone submitted the same video mid-flight.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.video.findUnique({
        where: { provider_providerVideoId: uniqueKey },
        select: { id: true },
      });
      return {
        error: "Someone just added this exact video!",
        duplicateVideoId: existing?.id,
      };
    }
    throw e;
  }

  redirect(`/watch/${videoId}`);
}

function revalidateVideoSurfaces(videoId: string, ...showSlugs: string[]) {
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath("/shows");
  revalidatePath(`/watch/${videoId}`);
  revalidatePath(`/watch/${videoId}/edit`);
  for (const slug of new Set(showSlugs)) revalidatePath(`/shows/${slug}`);
}

/**
 * Wiki-style metadata edit — open to every signed-in user. The state before
 * and after every edit is kept in the version history, so bad edits are
 * always one restore away.
 */
export async function updateVideo(
  videoId: string,
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to edit the catalog" };

  const parsed = videoEditSchema.safeParse({
    showTitle: formData.get("showTitle"),
    episodeTitle: formData.get("episodeTitle"),
    seasonNumber: formData.get("seasonNumber"),
    episodeNumber: formData.get("episodeNumber"),
    description: formData.get("description"),
    ageRangeTag: formData.get("ageRangeTag") || "Unknown",
    genreTags: formData.get("genreTags"),
    language: formData.get("language"),
    releaseYear: formData.get("releaseYear"),
    status: formData.get("status"),
    thumbnailUrl: formData.get("thumbnailUrl"),
    channelTitle: formData.get("channelTitle"),
    publishedAt: formData.get("publishedAt"),
    runtimeSeconds: formData.get("runtimeSeconds"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || (video.isHidden && !user.isAdmin)) return { error: "Video not found" };

  const d = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    await ensureVideoBaseline(tx, video);
    const show = await ensureShow(tx, {
      title: d.showTitle,
      status: d.status,
      genreTags: joinTags(d.genreTags.split(",")),
      language: d.language,
      releaseYear: d.releaseYear ?? null,
      ageRangeTag: d.ageRangeTag,
      coverImageUrl: d.thumbnailUrl ?? null,
      addedByUserId: video.submittedByUserId,
    });
    await ensureShowWikiStub(tx, show, user.id);
    const row = await tx.video.update({
      where: { id: videoId },
      data: {
        showId: show.id,
        showTitle: d.showTitle,
        showSlug: slugify(d.showTitle),
        episodeTitle: d.episodeTitle ?? null,
        seasonNumber: d.seasonNumber ?? null,
        episodeNumber: d.episodeNumber ?? null,
        description: d.description ?? null,
        ageRangeTag: d.ageRangeTag,
        genreTags: joinTags(d.genreTags.split(",")),
        language: d.language,
        releaseYear: d.releaseYear ?? null,
        status: d.status,
        thumbnailUrl: d.thumbnailUrl ?? null,
        channelTitle: d.channelTitle ?? null,
        publishedAt: parseDate(d.publishedAt),
        runtimeSeconds: d.runtimeSeconds ?? null,
      },
    });
    await snapshotVideo(tx, row, user.id);
    await refreshPublicStatsForVideo(tx, row.id);
    if (video.showSlug !== row.showSlug) {
      await refreshShowStatsBySlug(tx, video.showSlug);
    }
    return row;
  });

  revalidateVideoSurfaces(videoId, video.showSlug, updated.showSlug);
  revalidatePath("/admin/videos");
  return undefined;
}

export async function restoreVideoRevision(revisionId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to restore versions" };

  const revision = await prisma.videoRevision.findUnique({
    where: { id: revisionId },
    include: { video: true },
  });
  if (!revision) return { ok: false, error: "Version not found" };
  const video = revision.video;
  if (video.isHidden && !user.isAdmin) return { ok: false, error: "Video not found" };

  const updated = await prisma.$transaction(async (tx) => {
    await ensureVideoBaseline(tx, video);
    const show = await ensureShow(tx, {
      title: revision.showTitle,
      status: revision.status,
      genreTags: revision.genreTags,
      language: revision.language,
      releaseYear: revision.releaseYear,
      ageRangeTag: revision.ageRangeTag,
      coverImageUrl: revision.thumbnailUrl,
      addedByUserId: video.submittedByUserId,
    });
    await ensureShowWikiStub(tx, show, user.id);
    const row = await tx.video.update({
      where: { id: video.id },
      data: {
        showId: show.id,
        showTitle: revision.showTitle,
        showSlug: slugify(revision.showTitle),
        episodeTitle: revision.episodeTitle,
        seasonNumber: revision.seasonNumber,
        episodeNumber: revision.episodeNumber,
        description: revision.description,
        ageRangeTag: revision.ageRangeTag,
        genreTags: revision.genreTags,
        language: revision.language,
        releaseYear: revision.releaseYear,
        status: revision.status,
        thumbnailUrl: revision.thumbnailUrl,
        channelTitle: revision.channelTitle,
        publishedAt: revision.publishedAt,
        youtubePlaylistId: revision.youtubePlaylistId,
        playlistPosition: revision.playlistPosition,
        runtimeSeconds: revision.runtimeSeconds,
      },
    });
    await snapshotVideo(
      tx,
      row,
      user.id,
      `restored version from ${formatDate(revision.createdAt)}`
    );
    await refreshPublicStatsForVideo(tx, row.id);
    if (video.showSlug !== row.showSlug) {
      await refreshShowStatsBySlug(tx, video.showSlug);
    }
    return row;
  });

  revalidateVideoSurfaces(video.id, video.showSlug, updated.showSlug);
  return { ok: true, message: "Version restored" };
}
