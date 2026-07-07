import type { Metadata } from "next";
import { Suspense } from "react";
import { getShowSummaries, isShowSort } from "@/lib/queries/shows";
import { ShowCard } from "@/components/shows/show-card";
import { ShowFilterBar } from "@/components/shows/show-filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Shows" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ShowsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sortRaw = first(sp.sort);
  const filters = {
    q: first(sp.q)?.trim() || undefined,
    status: first(sp.status) || undefined,
    ageRangeTag: first(sp.age) || undefined,
    sort: isShowSort(sortRaw) ? sortRaw : undefined,
  };
  const shows = await getShowSummaries(filters);
  const hasFilters = Boolean(filters.q || filters.status || filters.ageRangeTag);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">All Shows</h1>
        <p className="mt-1 text-sm text-cream/60">
          Every series the community has catalogued, grouped by show.
        </p>
      </div>

      <Suspense>
        <ShowFilterBar />
      </Suspense>

      {shows.length === 0 ? (
        <EmptyState
          emoji={hasFilters ? "🔍" : "🎬"}
          title={hasFilters ? "No shows match those filters" : "No shows yet"}
          hint={
            hasFilters
              ? "Try clearing a filter or searching another title."
              : "Submit the first episode and a show page appears automatically."
          }
        >
          {hasFilters ? (
            <ButtonLink href="/shows" size="sm">
              Clear filters
            </ButtonLink>
          ) : (
            <ButtonLink href="/submit" size="sm">
              Submit a video
            </ButtonLink>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shows.map((s) => (
            <ShowCard key={s.showSlug} show={s} />
          ))}
        </div>
      )}
    </div>
  );
}
