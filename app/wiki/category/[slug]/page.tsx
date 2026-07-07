import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { WikiCard } from "@/components/wiki/wiki-card";
import { EmptyState } from "@/components/ui/empty-state";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.wikiCategory.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: category ? `Category: ${category.name}` : "Category not found" };
}

export default async function WikiCategoryPage({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getSessionUser();
  const category = await prisma.wikiCategory.findUnique({
    where: { slug },
    select: { id: true, name: true, description: true },
  });
  if (!category) notFound();

  const links = await prisma.wikiPageCategory.findMany({
    where: {
      categoryId: category.id,
      ...(user?.isAdmin ? {} : { wikiPage: { isHidden: false } }),
    },
    select: {
      wikiPage: {
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
      },
    },
  });
  const pages = links
    .map((l) => l.wikiPage)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-cream/40">
          Wiki category
        </p>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">{category.name}</h1>
        <p className="mt-1 text-sm text-cream/60">
          {pages.length} page{pages.length === 1 ? "" : "s"} ·{" "}
          <Link href="/wiki" className="font-bold text-osc-blue hover:underline">
            All wiki pages
          </Link>
        </p>
        {category.description ? (
          <p className="mt-2 max-w-3xl text-sm text-cream/70">{category.description}</p>
        ) : null}
      </div>

      {pages.length === 0 ? (
        <EmptyState
          emoji="🗂️"
          title="Nothing in this category yet"
          hint="Add [[Category:…]] to a wiki page to file it here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <WikiCard key={page.id} page={page} />
          ))}
        </div>
      )}
    </div>
  );
}
