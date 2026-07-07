import type { Prisma, Show, Video } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { joinTags } from "@/lib/format";
import { slugify } from "@/lib/slugify";
import { renderWikitext } from "@/lib/wiki-renderer";
import { refreshWikiPageStats } from "@/lib/public-stats";

type Tx = Prisma.TransactionClient;

export type ShowInput = {
  title: string;
  description?: string | null;
  status?: string;
  genreTags?: string;
  language?: string;
  releaseYear?: number | null;
  ageRangeTag?: string;
  coverImageUrl?: string | null;
  bannerImageUrl?: string | null;
  addedByUserId?: string | null;
  isUpcoming?: boolean;
  expectedReleaseDate?: Date | null;
};

function showStubContent(show: Pick<Show, "title" | "status" | "ageRangeTag" | "language" | "releaseYear" | "coverImageUrl">) {
  return `{{Stub}}
{{Infobox show
| title = ${show.title}
| image = ${show.coverImageUrl ?? ""}
| status = ${show.status}
| age = ${show.ageRangeTag}
| language = ${show.language}
| release_year = ${show.releaseYear ?? ""}
}}

== Summary ==
This page is a community-maintained wiki page for ${show.title}.

== Episodes ==
Episodes added to OSC will appear here.

== Characters ==
Add character information here.

== Trivia ==
Add trivia here.

[[Category:Shows]]`;
}

export function episodeStubContent(video: Pick<Video, "episodeTitle" | "showTitle" | "description" | "thumbnailUrl" | "ageRangeTag" | "seasonNumber" | "episodeNumber" | "provider" | "providerVideoId">) {
  const title = video.episodeTitle ?? video.showTitle;
  return `{{Stub}}
{{Infobox episode
| title = ${title}
| image = ${video.thumbnailUrl ?? ""}
| show = ${video.showTitle}
| season = ${video.seasonNumber ?? ""}
| episode = ${video.episodeNumber ?? ""}
| age = ${video.ageRangeTag}
}}

== Summary ==
${video.description || `This page is a community-maintained wiki page for ${title}.`}

== Video ==
[[${video.provider === "youtube" ? "YouTube" : "Vimeo"}:${video.providerVideoId}]]

[[Category:Episodes]]`;
}

export async function ensureShow(tx: Tx, input: ShowInput): Promise<Show> {
  const slug = slugify(input.title);
  const data = {
    title: input.title,
    slug,
    description: input.description ?? null,
    status: input.status ?? "Ongoing",
    genreTags: input.genreTags ?? "",
    language: input.language ?? "English",
    releaseYear: input.releaseYear ?? null,
    ageRangeTag: input.ageRangeTag ?? "Unknown",
    coverImageUrl: input.coverImageUrl ?? null,
    bannerImageUrl: input.bannerImageUrl ?? null,
    addedByUserId: input.addedByUserId ?? null,
    isUpcoming: input.isUpcoming ?? false,
    expectedReleaseDate: input.expectedReleaseDate ?? null,
  };

  const existing = await tx.show.findUnique({ where: { slug } });
  if (!existing) {
    return tx.show.create({ data });
  }

  return tx.show.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      description: existing.description ?? data.description,
      status: data.status,
      genreTags: joinTags([existing.genreTags, data.genreTags].join(",").split(",")),
      language: data.language,
      releaseYear: data.releaseYear ?? existing.releaseYear,
      ageRangeTag:
        existing.ageRangeTag === "Unknown" ? data.ageRangeTag : existing.ageRangeTag,
      coverImageUrl: existing.coverImageUrl ?? data.coverImageUrl,
      bannerImageUrl: existing.bannerImageUrl ?? data.bannerImageUrl,
      addedByUserId: existing.addedByUserId ?? data.addedByUserId,
      isUpcoming: existing.isUpcoming || data.isUpcoming,
      expectedReleaseDate: existing.expectedReleaseDate ?? data.expectedReleaseDate,
    },
  });
}

export async function ensureShowWikiStub(
  tx: Tx,
  show: Pick<Show, "id" | "title" | "slug" | "status" | "ageRangeTag" | "language" | "releaseYear" | "coverImageUrl">,
  userId?: string | null
) {
  const existing = await tx.wikiPage.findUnique({ where: { slug: show.slug } });
  if (existing) return existing;
  const content = showStubContent(show);
  const rendered = renderWikitext(content);
  const page = await tx.wikiPage.create({
    data: {
      title: show.title,
      slug: show.slug,
      pageType: show.status === "Upcoming" ? "Upcoming Show" : "Show",
      relatedShowId: show.id,
      contentWikitext: content,
      renderedHtml: rendered.html,
      summary: rendered.summary,
      mainImageUrl: show.coverImageUrl ?? null,
      infoboxDataJson: JSON.stringify(rendered.infoboxData),
      categories: rendered.categories.join(","),
      createdByUserId: userId ?? null,
      lastEditedByUserId: userId ?? null,
    },
  });
  await tx.wikiRevision.create({
    data: {
      wikiPageId: page.id,
      editorUserId: userId ?? null,
      contentWikitext: content,
      renderedHtml: rendered.html,
      editSummary: "auto-created show wiki stub",
    },
  });
  await syncWikiCategories(tx, page.id, rendered.categories);
  await refreshWikiPageStats(tx, page.id);
  return page;
}

export async function ensureEpisodeWikiStub(
  tx: Tx,
  video: Pick<Video, "id" | "episodeTitle" | "showTitle" | "description" | "thumbnailUrl" | "ageRangeTag" | "seasonNumber" | "episodeNumber" | "provider" | "providerVideoId">,
  userId?: string | null
) {
  const title = video.episodeTitle ?? video.showTitle;
  // Same-named episodes in different shows each get their own page: when the
  // plain slug belongs to some other page, use a show-suffixed slug instead.
  let slug = slugify(title);
  const existing = await tx.wikiPage.findUnique({ where: { slug } });
  if (existing) {
    if (existing.relatedVideoId === video.id) return existing;
    slug = slugify(`${title} ${video.showTitle}`);
    const suffixed = await tx.wikiPage.findUnique({ where: { slug } });
    if (suffixed) return suffixed;
  }
  const content = episodeStubContent(video);
  const rendered = renderWikitext(content);
  const page = await tx.wikiPage.create({
    data: {
      title,
      slug,
      pageType: "Episode",
      relatedVideoId: video.id,
      contentWikitext: content,
      renderedHtml: rendered.html,
      summary: rendered.summary,
      mainImageUrl: video.thumbnailUrl ?? null,
      infoboxDataJson: JSON.stringify(rendered.infoboxData),
      categories: rendered.categories.join(","),
      createdByUserId: userId ?? null,
      lastEditedByUserId: userId ?? null,
    },
  });
  await tx.wikiRevision.create({
    data: {
      wikiPageId: page.id,
      editorUserId: userId ?? null,
      contentWikitext: content,
      renderedHtml: rendered.html,
      editSummary: "auto-created episode wiki stub",
    },
  });
  await syncWikiCategories(tx, page.id, rendered.categories);
  await refreshWikiPageStats(tx, page.id);
  return page;
}

export async function syncWikiCategories(tx: Tx, wikiPageId: string, categoryNames: string[]) {
  const names = [...new Set(categoryNames.map((c) => c.trim()).filter(Boolean))];
  await tx.wikiPageCategory.deleteMany({ where: { wikiPageId } });
  for (const name of names) {
    const slug = slugify(name);
    const category = await tx.wikiCategory.upsert({
      where: { slug },
      update: { name },
      create: { slug, name },
    });
    await tx.wikiPageCategory.create({
      data: { wikiPageId, categoryId: category.id },
    });
  }
}

export async function backfillShowsAndWiki(): Promise<void> {
  const videos = await prisma.video.findMany({
    where: { showId: null },
    orderBy: [
      { showSlug: "asc" },
      { seasonNumber: "asc" },
      { episodeNumber: "asc" },
      { createdAt: "asc" },
    ],
  });
  if (videos.length === 0) return;

  const bySlug = new Map<string, typeof videos>();
  for (const video of videos) {
    const list = bySlug.get(video.showSlug) ?? [];
    list.push(video);
    bySlug.set(video.showSlug, list);
  }

  for (const group of bySlug.values()) {
    const first = group[0];
    await prisma.$transaction(async (tx) => {
      const show = await ensureShow(tx, {
        title: first.showTitle,
        status: first.status,
        genreTags: joinTags(group.flatMap((v) => v.genreTags.split(","))),
        language: first.language,
        releaseYear: first.releaseYear,
        ageRangeTag: first.ageRangeTag,
        coverImageUrl: first.thumbnailUrl,
        addedByUserId: first.submittedByUserId,
      });
      await tx.video.updateMany({
        where: { id: { in: group.map((v) => v.id) }, showId: null },
        data: { showId: show.id },
      });
      await ensureShowWikiStub(tx, show, first.submittedByUserId);
    });
  }
}
