"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminUser, getSessionUser } from "@/lib/auth-helpers";
import {
  fieldErrorsFrom,
  upcomingShowSchema,
  wikiDiscussionSchema,
  wikiPageSchema,
} from "@/lib/validation";
import { renderWikitext } from "@/lib/wiki-renderer";
import { safeExternalImageUrl } from "@/lib/safe-url";
import {
  ensureShow,
  ensureShowWikiStub,
  syncWikiCategories,
} from "@/lib/shows";
import { joinTags } from "@/lib/format";
import { slugify } from "@/lib/slugify";
import { refreshWikiPageStats } from "@/lib/public-stats";
import type { ActionResult, FormState } from "@/lib/types";

function revalidateWiki(slug?: string) {
  revalidatePath("/wiki");
  revalidatePath("/admin/wiki");
  if (slug) {
    revalidatePath(`/wiki/${slug}`);
    revalidatePath(`/wiki/${slug}/edit`);
    revalidatePath(`/wiki/${slug}/history`);
    revalidatePath(`/wiki/${slug}/discussion`);
  }
}

function splitCategories(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function saveWikiPage(
  currentSlug: string | null,
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to edit the wiki" };

  const parsed = wikiPageSchema.safeParse({
    title: formData.get("title"),
    pageType: formData.get("pageType") || "Other",
    relatedShowId: formData.get("relatedShowId"),
    relatedVideoId: formData.get("relatedVideoId"),
    mainImageUrl: formData.get("mainImageUrl"),
    categories: formData.get("categories"),
    contentWikitext: formData.get("contentWikitext"),
    editSummary: formData.get("editSummary"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const d = parsed.data;
  const slug = slugify(d.title);
  if (d.mainImageUrl && !safeExternalImageUrl(d.mainImageUrl)) {
    return { fieldErrors: { mainImageUrl: ["Use a safe external image URL."] } };
  }

  const existing = currentSlug
    ? await prisma.wikiPage.findUnique({ where: { slug: currentSlug } })
    : null;
  if (existing?.isProtected && !user.isAdmin) {
    return { error: "This page is protected. Ask a mod to make changes." };
  }
  const adminVisibility = user.isAdmin
    ? {
        isHidden: formData.get("isHidden") === "on",
        isProtected: formData.get("isProtected") === "on",
      }
    : {};

  const rendered = renderWikitext(d.contentWikitext);
  const categories = [
    ...new Set([...splitCategories(d.categories), ...rendered.categories]),
  ];

  // Renaming/creating onto an existing page's slug would blow up on the
  // unique index. Show-related pages get a Wikipedia-style disambiguated
  // slug ("firey-battle-for-a-stick") so every show's wiki can have its own
  // "Firey"; otherwise say so in a friendly way.
  let slugToUse = slug;
  if (slugToUse !== currentSlug) {
    const taken = await prisma.wikiPage.findUnique({
      where: { slug: slugToUse },
      select: { id: true },
    });
    if (taken) {
      const show = d.relatedShowId
        ? await prisma.show.findUnique({
            where: { id: d.relatedShowId },
            select: { title: true },
          })
        : null;
      const disambiguated = show ? slugify(`${d.title} ${show.title}`) : null;
      if (disambiguated && disambiguated === currentSlug) {
        slugToUse = currentSlug; // page already lives at its disambiguated slug
      } else if (
        disambiguated &&
        !(await prisma.wikiPage.findUnique({
          where: { slug: disambiguated },
          select: { id: true },
        }))
      ) {
        slugToUse = disambiguated;
      } else {
        return {
          fieldErrors: {
            title: [`A wiki page with this title already exists (/wiki/${slugToUse})`],
          },
        };
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
    const page = existing
      ? await tx.wikiPage.update({
          where: { id: existing.id },
          data: {
            title: d.title,
            slug: slugToUse,
            pageType: d.pageType,
            relatedShowId: d.relatedShowId ?? null,
            relatedVideoId: d.relatedVideoId ?? null,
            contentWikitext: d.contentWikitext,
            renderedHtml: rendered.html,
            summary: rendered.summary,
            mainImageUrl: d.mainImageUrl ?? null,
            infoboxDataJson: JSON.stringify(rendered.infoboxData),
            categories: categories.join(","),
            lastEditedByUserId: user.id,
            ...adminVisibility,
          },
        })
      : await tx.wikiPage.create({
          data: {
            title: d.title,
            slug: slugToUse,
            pageType: d.pageType,
            relatedShowId: d.relatedShowId ?? null,
            relatedVideoId: d.relatedVideoId ?? null,
            contentWikitext: d.contentWikitext,
            renderedHtml: rendered.html,
            summary: rendered.summary,
            mainImageUrl: d.mainImageUrl ?? null,
            infoboxDataJson: JSON.stringify(rendered.infoboxData),
            categories: categories.join(","),
            createdByUserId: user.id,
            lastEditedByUserId: user.id,
            ...adminVisibility,
          },
        });

      await tx.wikiRevision.create({
        data: {
          wikiPageId: page.id,
          editorUserId: user.id,
          contentWikitext: d.contentWikitext,
          renderedHtml: rendered.html,
          editSummary: d.editSummary ?? (existing ? "updated page" : "created page"),
        },
      });
      await syncWikiCategories(tx, page.id, categories);
      await refreshWikiPageStats(tx, page.id);
    });
  } catch (e) {
    // Lost a create race for the same title.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        fieldErrors: {
          title: [`A wiki page with this title already exists (/wiki/${slugToUse})`],
        },
      };
    }
    throw e;
  }

  revalidateWiki(currentSlug ?? slugToUse);
  if (currentSlug && currentSlug !== slugToUse) revalidateWiki(slugToUse);
  redirect(`/wiki/${slugToUse}`);
}

export async function addWikiDiscussion(
  wikiPageId: string,
  slug: string,
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to join the discussion" };
  const parsed = wikiDiscussionSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const page = await prisma.wikiPage.findUnique({
    where: { id: wikiPageId },
    select: { id: true, isHidden: true },
  });
  if (!page || page.isHidden) return { error: "Wiki page not found" };
  await prisma.wikiDiscussion.create({
    data: { wikiPageId, userId: user.id, text: parsed.data.text },
  });
  revalidateWiki(slug);
  return undefined;
}

export async function toggleWikiPageWatch(
  wikiPageId: string,
  slug: string
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to watch wiki pages" };

  const page = await prisma.wikiPage.findUnique({
    where: { id: wikiPageId },
    select: { id: true, isHidden: true },
  });
  if (!page || page.isHidden) return { ok: false, error: "Wiki page not found" };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.wikiPageWatch.findUnique({
      where: { userId_wikiPageId: { userId: user.id, wikiPageId } },
      select: { id: true },
    });
    if (existing) {
      await tx.wikiPageWatch.delete({ where: { id: existing.id } });
    } else {
      await tx.wikiPageWatch.create({ data: { userId: user.id, wikiPageId } });
    }
    await refreshWikiPageStats(tx, wikiPageId);
  });
  revalidateWiki(slug);
  return { ok: true };
}

export async function adminSetWikiHidden(
  pageId: string,
  hidden: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Not authorized" };
  const page = await prisma.wikiPage.update({
    where: { id: pageId },
    data: { isHidden: hidden },
    select: { slug: true },
  });
  revalidateWiki(page.slug);
  return { ok: true };
}

export async function adminSetWikiProtected(
  pageId: string,
  isProtected: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Not authorized" };
  const page = await prisma.wikiPage.update({
    where: { id: pageId },
    data: { isProtected },
    select: { slug: true },
  });
  revalidateWiki(page.slug);
  return { ok: true };
}

export async function adminHideWikiDiscussion(
  discussionId: string,
  hidden: boolean
): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Not authorized" };
  const discussion = await prisma.wikiDiscussion.update({
    where: { id: discussionId },
    data: { isHidden: hidden },
    select: { wikiPage: { select: { slug: true } } },
  });
  revalidateWiki(discussion.wikiPage.slug);
  return { ok: true };
}

export async function adminRestoreWikiRevision(revisionId: string): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Not authorized" };
  const revision = await prisma.wikiRevision.findUnique({
    where: { id: revisionId },
    include: { wikiPage: true },
  });
  if (!revision) return { ok: false, error: "Revision not found" };
  const rendered = renderWikitext(revision.contentWikitext);
  const categories = [
    ...new Set([...splitCategories(revision.wikiPage.categories), ...rendered.categories]),
  ];
  await prisma.$transaction(async (tx) => {
    await tx.wikiPage.update({
      where: { id: revision.wikiPageId },
      data: {
        contentWikitext: revision.contentWikitext,
        renderedHtml: revision.renderedHtml || rendered.html,
        summary: rendered.summary,
        infoboxDataJson: JSON.stringify(rendered.infoboxData),
        categories: categories.join(","),
        lastEditedByUserId: admin.id,
      },
    });
    await tx.wikiRevision.create({
      data: {
        wikiPageId: revision.wikiPageId,
        editorUserId: admin.id,
        contentWikitext: revision.contentWikitext,
        renderedHtml: revision.renderedHtml || rendered.html,
        editSummary: "restored old revision",
      },
    });
    await syncWikiCategories(tx, revision.wikiPageId, categories);
    await refreshWikiPageStats(tx, revision.wikiPageId);
  });
  revalidateWiki(revision.wikiPage.slug);
  return { ok: true, message: "Revision restored" };
}

function parseOptionalDate(raw?: string) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createUpcomingShow(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to add upcoming shows" };
  const parsed = upcomingShowSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    creatorName: formData.get("creatorName"),
    expectedReleaseDate: formData.get("expectedReleaseDate"),
    ageRangeTag: formData.get("ageRangeTag") || "Unknown",
    language: formData.get("language") || "English",
    genres: formData.getAll("genres"),
    extraTags: formData.get("extraTags"),
    trailerUrl: formData.get("trailerUrl"),
    coverImageUrl: formData.get("coverImageUrl"),
    sourceLinks: formData.get("sourceLinks"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = parsed.data;
  if (d.coverImageUrl && !safeExternalImageUrl(d.coverImageUrl)) {
    return { fieldErrors: { coverImageUrl: ["Use a safe external image URL."] } };
  }
  const genreTags = joinTags([
    ...d.genres,
    ...(d.extraTags ? d.extraTags.split(",") : []),
  ]);
  let showSlug = "";
  await prisma.$transaction(async (tx) => {
    const show = await ensureShow(tx, {
      title: d.title,
      description: d.description ?? null,
      status: "Upcoming",
      genreTags,
      language: d.language,
      ageRangeTag: d.ageRangeTag,
      coverImageUrl: d.coverImageUrl ?? null,
      addedByUserId: user.id,
      isUpcoming: true,
      expectedReleaseDate: parseOptionalDate(d.expectedReleaseDate),
    });
    showSlug = show.slug;
    const page = await ensureShowWikiStub(tx, show, user.id);
    const additions = [
      d.creatorName ? `Creator: ${d.creatorName}` : "",
      d.trailerUrl ? `[${d.trailerUrl} Trailer]` : "",
      d.sourceLinks ? `Sources:\n${d.sourceLinks}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (additions) {
      const content = `${page.contentWikitext}\n\n== Sources ==\n${additions}`;
      const rendered = renderWikitext(content);
      await tx.wikiPage.update({
        where: { id: page.id },
        data: {
          contentWikitext: content,
          renderedHtml: rendered.html,
          summary: rendered.summary,
          infoboxDataJson: JSON.stringify(rendered.infoboxData),
          categories: rendered.categories.join(","),
          lastEditedByUserId: user.id,
        },
      });
      await tx.wikiRevision.create({
        data: {
          wikiPageId: page.id,
          editorUserId: user.id,
          contentWikitext: content,
          renderedHtml: rendered.html,
          editSummary: "added upcoming show details",
        },
      });
      await syncWikiCategories(tx, page.id, rendered.categories);
      await refreshWikiPageStats(tx, page.id);
    }
  });
  revalidatePath("/upcoming");
  revalidatePath("/shows");
  revalidateWiki(showSlug);
  redirect(`/wiki/${showSlug}`);
}
