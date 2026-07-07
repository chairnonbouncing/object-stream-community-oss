import type { Metadata } from "next";
import { Suspense } from "react";
import {
  isDiscoverRuntime,
  isDiscoverSort,
  getDiscoverPage,
  getDistinctYears,
  type DiscoverFilters,
} from "@/lib/queries/videos";
import { getSessionUser } from "@/lib/auth-helpers";
import { searchShowSummaries } from "@/lib/queries/shows";
import { searchPublicPlaylists } from "@/lib/queries/playlists";
import { searchWikiPages } from "@/lib/queries/wiki";
import { FilterBar } from "@/components/discover/filter-bar";
import { VideoCard } from "@/components/video/video-card";
import { ShowCard } from "@/components/shows/show-card";
import { PlaylistCard } from "@/components/playlists/playlist-card";
import { WikiCard } from "@/components/wiki/wiki-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toFilters(sp: SearchParams): DiscoverFilters {
  const sortRaw = first(sp.sort);
  const runtimeRaw = first(sp.runtime);
  const yearRaw = Number(first(sp.year));
  const pageRaw = Number(first(sp.page));
  return {
    q: first(sp.q)?.trim() || undefined,
    genre: first(sp.genre) || undefined,
    status: first(sp.status) || undefined,
    year: Number.isInteger(yearRaw) && yearRaw > 0 ? yearRaw : undefined,
    language: first(sp.language) || undefined,
    provider: first(sp.provider) || undefined,
    ageRangeTag: first(sp.age) || undefined,
    runtime: isDiscoverRuntime(runtimeRaw) ? runtimeRaw : undefined,
    sort: isDiscoverSort(sortRaw) ? sortRaw : undefined,
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = toFilters(sp);
  const discoverPromise = getDiscoverPage(filters);
  const yearsPromise = getDistinctYears();
  const companionPromise =
    filters.q && filters.page === 1
      ? getSessionUser().then((user) =>
          Promise.all([
            searchShowSummaries(filters.q!, {
              take: 4,
              includeHidden: Boolean(user?.isAdmin),
            }),
            searchPublicPlaylists(filters.q!, 4),
            searchWikiPages(filters.q!, {
              take: 4,
              includeHidden: Boolean(user?.isAdmin),
            }),
          ])
        )
      : Promise.resolve([[], [], []] as const);
  const [
    { videos, total, page, pageCount },
    years,
    [showMatches, playlistMatches, wikiMatches],
  ] = await Promise.all([discoverPromise, yearsPromise, companionPromise]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">Discover</h1>
        <p className="mt-1 text-sm text-cream/60">
          {total} video{total === 1 ? "" : "s"} in the community catalog — every one
          plays through the official player.
        </p>
      </div>

      <Suspense>
        <FilterBar years={years} />
      </Suspense>

      {showMatches.length > 0 ||
      playlistMatches.length > 0 ||
      wikiMatches.length > 0 ? (
        <div className="space-y-6">
          {showMatches.length > 0 ? (
            <section>
              <SectionHeading title="Matching Shows" href={`/shows?q=${encodeURIComponent(filters.q ?? "")}`} />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {showMatches.map((show) => (
                  <ShowCard key={show.showSlug} show={show} />
                ))}
              </div>
            </section>
          ) : null}

          {playlistMatches.length > 0 ? (
            <section>
              <SectionHeading title="Matching Playlists" href={`/playlists?q=${encodeURIComponent(filters.q ?? "")}`} />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {playlistMatches.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            </section>
          ) : null}

          {wikiMatches.length > 0 ? (
            <section>
              <SectionHeading
                title="From the Wiki"
                href={`/wiki?q=${encodeURIComponent(filters.q ?? "")}`}
                linkLabel="Search the wiki"
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {wikiMatches.map((pageResult) => (
                  <WikiCard key={pageResult.id} page={pageResult} compact />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {videos.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="Nothing found"
          hint={
            filters.q || filters.genre
              ? "Try different filters — or be the hero who adds it!"
              : "The catalog is waiting for its first submission."
          }
        >
          <ButtonLink href="/submit" size="sm">
            Submit a video
          </ButtonLink>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}

      <Pagination
        basePath="/discover"
        params={{
          q: filters.q,
          genre: filters.genre,
          status: filters.status,
          year: filters.year ? String(filters.year) : undefined,
          language: filters.language,
          provider: filters.provider,
          age: filters.ageRangeTag,
          runtime: filters.runtime,
          sort: filters.sort,
        }}
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}
