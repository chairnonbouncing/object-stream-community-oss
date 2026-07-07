import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { WikiEditorForm } from "@/components/wiki/wiki-editor-form";

export const metadata: Metadata = { title: "Edit Wiki Page" };

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function WikiEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const [{ slug }, { show: prefillShowId }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/wiki/${slug}/edit`);
  const [page, shows, categories, wikiPages] = await Promise.all([
    slug === "new"
      ? Promise.resolve(null)
      : prisma.wikiPage.findUnique({
          where: { slug },
          select: {
            slug: true,
            title: true,
            pageType: true,
            relatedShowId: true,
            relatedVideoId: true,
            mainImageUrl: true,
            categories: true,
            contentWikitext: true,
            isHidden: true,
            isProtected: true,
          },
        }),
    prisma.show.findMany({
      where: user.isAdmin ? {} : { isHidden: false },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.wikiCategory.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.wikiPage.findMany({
      where: user.isAdmin ? {} : { isHidden: false },
      orderBy: { title: "asc" },
      select: { title: true },
      take: 250,
    }),
  ]);
  if (slug !== "new" && !page) notFound();
  if (page?.isHidden && !user.isAdmin) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">
          {page ? `Edit ${page.title}` : "Create wiki page"}
        </h1>
        <p className="mt-1 text-sm text-cream/60">
          Edit visually, use source mode for advanced wikitext, and preview the
          exact safe render before saving.
        </p>
      </div>
      <WikiEditorForm
        currentSlug={page?.slug ?? null}
        page={
          page ?? {
            title: slug === "new" ? "" : titleFromSlug(slug),
            pageType: "Other",
            // “＋ New page” inside a show's wiki pre-selects that show.
            relatedShowId:
              prefillShowId && shows.some((s) => s.id === prefillShowId)
                ? prefillShowId
                : null,
            relatedVideoId: null,
            mainImageUrl: null,
            categories: "",
            contentWikitext: "{{Stub}}\n\n== Summary ==\n",
            isHidden: false,
            isProtected: false,
          }
        }
        shows={shows}
        categoryNames={categories.map((category) => category.name)}
        wikiPageTitles={wikiPages.map((wikiPage) => wikiPage.title)}
        isAdmin={user.isAdmin}
      />
    </div>
  );
}
