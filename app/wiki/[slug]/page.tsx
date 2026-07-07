import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { getWikiSpace } from "@/lib/queries/wiki";
import { addHeadingAnchors, cleanWikiSummary } from "@/lib/wiki-toc";
import { formatCount, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ReportButton } from "@/components/shared/report-button";
import { WikiPageAdminActions } from "@/components/wiki/wiki-admin-actions";
import { WikiSpaceNav } from "@/components/wiki/wiki-space-nav";
import { WikiToc } from "@/components/wiki/wiki-toc";
import { WikiWatchButton } from "@/components/wiki/wiki-watch-button";
import { PublicViewTracker } from "@/components/shared/public-view-tracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { title: true, summary: true },
  });
  return {
    title: page?.title ?? "Wiki page not found",
    description: cleanWikiSummary(page?.summary ?? null) ?? undefined,
  };
}

export default async function WikiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "new") redirect("/wiki/new/edit");
  const user = await getSessionUser();
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      relatedShow: { select: { slug: true, title: true, ageRangeTag: true, status: true } },
      relatedVideo: {
        select: { id: true, episodeTitle: true, showTitle: true, ageRangeTag: true, showId: true },
      },
      categoryLinks: { include: { category: true } },
    },
  });
  if (!page || (page.isHidden && !user?.isAdmin)) notFound();

  const { html: articleHtml, toc } = addHeadingAnchors(page.renderedHtml);

  // Wiki space: sibling pages of the same show (episode pages join through
  // their video's show).
  const spaceShowId = page.relatedShowId ?? page.relatedVideo?.showId ?? null;
  const [space, contributors, isWatching] = await Promise.all([
    spaceShowId
      ? getWikiSpace(spaceShowId, { includeHidden: Boolean(user?.isAdmin) })
      : Promise.resolve(null),
    prisma.wikiRevision.findMany({
      where: { wikiPageId: page.id, editorUserId: { not: null } },
      distinct: ["editorUserId"],
      select: { editorUserId: true },
    }),
    user
      ? prisma.wikiPageWatch.findUnique({
          where: { userId_wikiPageId: { userId: user.id, wikiPageId: page.id } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      {!page.isHidden ? <PublicViewTracker kind="wiki" targetId={page.id} /> : null}
      {space && space.pages.length > 0 ? (
        <WikiSpaceNav space={space} currentPageId={page.id} />
      ) : null}
      {page.isHidden ? (
        <p className="rounded-2xl border border-osc-red/40 bg-osc-red/10 px-4 py-3 text-sm font-bold text-osc-red">
          This wiki page is hidden from the public. Admin preview is active.
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={page.pageType === "Show" ? "purple" : "blue"}>{page.pageType}</Badge>
            {page.relatedShow?.ageRangeTag ? <Badge color="yellow">{page.relatedShow.ageRangeTag}</Badge> : null}
            {page.isProtected ? <Badge color="yellow">Protected</Badge> : null}
          </div>
          <h1 className="mt-2 font-display text-4xl text-cream sm:text-5xl">{page.title}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-cream/50">
            {page.relatedShow ? (
              <Link href={`/shows/${page.relatedShow.slug}`} className="font-bold text-osc-blue hover:underline">
                Show: {page.relatedShow.title}
              </Link>
            ) : null}
            {page.relatedVideo ? (
              <Link href={`/watch/${page.relatedVideo.id}`} className="font-bold text-osc-blue hover:underline">
                Video: {page.relatedVideo.episodeTitle ?? page.relatedVideo.showTitle}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/wiki/${page.slug}/edit`} variant="ghost" size="sm">
            Edit
          </ButtonLink>
          <ButtonLink href={`/wiki/${page.slug}/history`} variant="ghost" size="sm">
            History
          </ButtonLink>
          <ButtonLink href={`/wiki/${page.slug}/discussion`} variant="ghost" size="sm">
            Discussion
          </ButtonLink>
          <WikiWatchButton
            wikiPageId={page.id}
            slug={page.slug}
            initialWatching={Boolean(isWatching)}
            signedIn={Boolean(user)}
          />
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cream/45">
        {[
          `${formatCount(page.viewCount)} views`,
          `${formatCount(page.editCount)} edits`,
          `${formatCount(contributors.length)} contributor${contributors.length === 1 ? "" : "s"}`,
          `${formatCount(page.watcherCount)} watching`,
          page.lastEditedAt ? `last edited ${formatDate(page.lastEditedAt)}` : "never edited",
        ].map((stat, i) => (
          <span key={stat} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>·</span> : null}
            {stat}
          </span>
        ))}
      </p>

      {user?.isAdmin ? (
        <WikiPageAdminActions
          pageId={page.id}
          isHidden={page.isHidden}
          isProtected={page.isProtected}
        />
      ) : null}

      {page.mainImageUrl && !page.renderedHtml.includes("wiki-infobox-image") ? (
        // Page thumbnail — only when the article body doesn't already show
        // an infobox image, so it never appears twice.
        <img
          src={page.mainImageUrl}
          alt={page.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-64 rounded-2xl border border-line object-cover"
        />
      ) : null}

      <WikiToc toc={toc} />

      <article
        className="wiki-content rounded-3xl border border-line bg-surface p-5 sm:p-7"
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />

      {page.categoryLinks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-cream/40">Categories:</span>
          {page.categoryLinks.map(({ category }) => (
            <Link
              key={category.id}
              href={`/wiki/category/${category.slug}`}
              className="rounded-full border border-line px-3 py-1 font-bold text-cream/60 transition hover:border-osc-blue/60 hover:text-osc-blue"
            >
              {category.name}
            </Link>
          ))}
        </div>
      ) : null}

      <ReportButton targetType="wiki_page" targetId={page.id} signedIn={Boolean(user)} />
    </div>
  );
}
