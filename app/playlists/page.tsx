import type { Metadata } from "next";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  getPublicPlaylists,
  getUserPlaylists,
  isPlaylistSort,
} from "@/lib/queries/playlists";
import { PlaylistCard } from "@/components/playlists/playlist-card";
import { PlaylistFilterBar } from "@/components/playlists/playlist-filter-bar";
import { PlaylistForm } from "@/components/playlists/playlist-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = { title: "Playlists" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PlaylistsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sortRaw = first(sp.sort);
  const filters = {
    q: first(sp.q)?.trim() || undefined,
    sort: isPlaylistSort(sortRaw) ? sortRaw : undefined,
  };
  const user = await getSessionUser();
  const [publicPlaylists, ownPlaylists] = await Promise.all([
    getPublicPlaylists(60, filters),
    user ? getUserPlaylists(user.id) : Promise.resolve([]),
  ]);

  const ownIds = new Set(ownPlaylists.map((p) => p.id));
  const communityPlaylists = publicPlaylists.filter((p) => !ownIds.has(p.id));
  const hasFilters = Boolean(filters.q);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-cream sm:text-4xl">Playlists</h1>
          <p className="mt-1 text-sm text-cream/60">
            Marathon orders, best-of collections, watch guides — made by fans, played
            through official embeds.
          </p>
        </div>
        {user ? (
          <details className="w-full max-w-md rounded-3xl border border-line bg-surface open:p-5 sm:w-auto sm:min-w-96">
            <summary className="cursor-pointer select-none rounded-full px-5 py-2.5 text-center text-sm font-bold text-night [details[open]>&]:mb-4 [details[open]>&]:bg-transparent [details[open]>&]:text-cream bg-white">
              ＋ New Playlist
            </summary>
            <PlaylistForm />
          </details>
        ) : (
          <ButtonLink href="/signin?callbackUrl=%2Fplaylists" variant="outline" size="sm">
            Sign in to create playlists
          </ButtonLink>
        )}
      </div>

      {ownPlaylists.length > 0 ? (
        <section>
          <SectionHeading title="Your playlists" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {ownPlaylists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading title="Community playlists" />
        <Suspense>
          <PlaylistFilterBar />
        </Suspense>
        {communityPlaylists.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              emoji={hasFilters ? "🔍" : "🎞️"}
              title={hasFilters ? "No playlists match that search" : "No public playlists yet"}
              hint={
                hasFilters
                  ? "Try another playlist name or clear the search."
                  : "Create the first one and help everyone binge in the right order."
              }
            >
              {hasFilters ? (
                <ButtonLink href="/playlists" size="sm">
                  Clear search
                </ButtonLink>
              ) : null}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {communityPlaylists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
