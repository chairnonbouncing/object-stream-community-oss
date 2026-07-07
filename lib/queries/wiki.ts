import { prisma } from "@/lib/prisma";

export type WikiSearchResult = {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  summary: string | null;
  mainImageUrl: string | null;
  categories: string;
  isProtected: boolean;
  isHidden: boolean;
  viewCount: number;
  editCount: number;
  revisionCount: number;
  watcherCount: number;
  lastEditedAt: Date | null;
  updatedAt: Date;
  lastEditedBy: { username: string } | null;
};

/**
 * Case-insensitive wiki search across titles, summaries, categories, and the
 * page text itself. Hidden pages only surface for admins.
 */
export async function searchWikiPages(
  q: string,
  opts: { take?: number; includeHidden?: boolean } = {}
): Promise<WikiSearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  return prisma.wikiPage.findMany({
    where: {
      ...(opts.includeHidden ? {} : { isHidden: false }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } },
        { categories: { contains: query, mode: "insensitive" } },
        { contentWikitext: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: opts.take ?? 30,
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      summary: true,
      mainImageUrl: true,
      categories: true,
      isProtected: true,
      isHidden: true,
      viewCount: true,
      editCount: true,
      revisionCount: true,
      watcherCount: true,
      lastEditedAt: true,
      updatedAt: true,
      lastEditedBy: { select: { username: true } },
    },
  });
}

export type WikiSpace = {
  show: { id: string; title: string; slug: string };
  pages: Array<{
    id: string;
    slug: string;
    title: string;
    pageType: string;
  }>;
};

const MAIN_PAGE_TYPES = ["Show", "Upcoming Show"];

/**
 * A show's wiki "space": every page related to the show (directly, or through
 * one of its videos), main page first. Powers the in-wiki navigation bar.
 */
export async function getWikiSpace(
  showId: string,
  opts: { includeHidden?: boolean } = {}
): Promise<WikiSpace | null> {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    select: { id: true, title: true, slug: true },
  });
  if (!show) return null;

  const pages = await prisma.wikiPage.findMany({
    where: {
      ...(opts.includeHidden ? {} : { isHidden: false }),
      OR: [{ relatedShowId: showId }, { relatedVideo: { showId } }],
    },
    orderBy: [{ pageType: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, pageType: true },
  });

  pages.sort((a, b) => {
    const aMain = MAIN_PAGE_TYPES.includes(a.pageType) ? 0 : 1;
    const bMain = MAIN_PAGE_TYPES.includes(b.pageType) ? 0 : 1;
    return aMain - bMain || a.pageType.localeCompare(b.pageType) || a.title.localeCompare(b.title);
  });

  return { show, pages };
}

export async function listWikiPages(
  opts: { take?: number; includeHidden?: boolean } = {}
): Promise<WikiSearchResult[]> {
  return prisma.wikiPage.findMany({
    where: opts.includeHidden ? {} : { isHidden: false },
    orderBy: { updatedAt: "desc" },
    take: opts.take ?? 60,
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      summary: true,
      mainImageUrl: true,
      categories: true,
      isProtected: true,
      isHidden: true,
      viewCount: true,
      editCount: true,
      revisionCount: true,
      watcherCount: true,
      lastEditedAt: true,
      updatedAt: true,
      lastEditedBy: { select: { username: true } },
    },
  });
}

export async function getRecentlyUpdatedWikiPages(
  opts: { take?: number; includeHidden?: boolean } = {}
): Promise<WikiSearchResult[]> {
  return prisma.wikiPage.findMany({
    where: opts.includeHidden ? {} : { isHidden: false },
    orderBy: [{ lastEditedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: opts.take ?? 8,
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      summary: true,
      mainImageUrl: true,
      categories: true,
      isProtected: true,
      isHidden: true,
      viewCount: true,
      editCount: true,
      revisionCount: true,
      watcherCount: true,
      lastEditedAt: true,
      updatedAt: true,
      lastEditedBy: { select: { username: true } },
    },
  });
}
