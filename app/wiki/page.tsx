import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { listWikiPages, searchWikiPages } from "@/lib/queries/wiki";
import { WikiCard } from "@/components/wiki/wiki-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Wiki" };

export default async function WikiIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const user = await getSessionUser();
  const includeHidden = Boolean(user?.isAdmin);

  const [pages, categories] = await Promise.all([
    query
      ? searchWikiPages(query, { take: 60, includeHidden })
      : listWikiPages({ take: 60, includeHidden }),
    prisma.wikiCategory.findMany({
      orderBy: { name: "asc" },
      take: 40,
      include: { _count: { select: { pages: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-cream sm:text-4xl">OSC Wiki</h1>
          <p className="mt-1 max-w-3xl text-sm text-cream/60">
            Community pages for shows, episodes, characters, creators, lore, trivia,
            and production history. Images stay external by URL; videos stay official embeds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/wiki/changes" variant="ghost" size="sm">
            Recent changes
          </ButtonLink>
          <ButtonLink href="/wiki/random" variant="ghost" size="sm" prefetch={false}>
            🎲 Random page
          </ButtonLink>
          <ButtonLink href="/wiki/new/edit" variant="accent" size="sm">
            Create page
          </ButtonLink>
        </div>
      </div>

      <form action="/wiki" className="max-w-xl" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search wiki pages — titles, text, categories…"
          aria-label="Search the wiki"
          className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none focus:ring-2 focus:ring-osc-purple/40"
        />
      </form>

      {query ? (
        <p className="text-sm text-cream/60">
          {pages.length === 60 ? "60+" : pages.length} result
          {pages.length === 1 ? "" : "s"} for “{query}”
        </p>
      ) : null}

      {pages.length === 0 ? (
        query ? (
          <EmptyState
            emoji="🔍"
            title={`Nothing found for “${query}”`}
            hint="Try another word — or be the one who writes the page!"
          >
            <ButtonLink href="/wiki/new/edit" size="sm">
              Create page
            </ButtonLink>
          </EmptyState>
        ) : (
          <EmptyState
            emoji="📚"
            title="No wiki pages yet"
            hint="Start with a show, episode, or character page."
          >
            <ButtonLink href="/wiki/new/edit" size="sm">
              Create page
            </ButtonLink>
          </EmptyState>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <WikiCard key={page.id} page={page} />
          ))}
        </div>
      )}

      {categories.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-2xl text-cream">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <a
                key={category.id}
                href={`/wiki/category/${category.slug}`}
                className="rounded-full border border-line px-3 py-1 text-xs font-bold text-cream/60 transition hover:border-osc-blue/60 hover:text-osc-blue"
              >
                {category.name} ({category._count.pages})
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
