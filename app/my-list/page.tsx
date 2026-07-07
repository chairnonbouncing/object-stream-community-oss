import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { getMyListData } from "@/lib/queries/profile";
import { VideoCard } from "@/components/video/video-card";
import { PlaylistCard } from "@/components/playlists/playlist-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { WatchStatusSelect } from "@/components/watch/watch-status-select";

export const metadata: Metadata = { title: "My List" };

const statusEmoji: Record<string, string> = {
  Watching: "▶️",
  Completed: "✅",
  "Plan to Watch": "📌",
  "On Hold": "⏸️",
  Dropped: "🗑️",
  Rewatching: "🔁",
};

export default async function MyListPage() {
  const user = await requireUser("/my-list");
  const { groups, favoriteShows, playlists } = await getMyListData(user.id);

  const empty =
    groups.length === 0 && favoriteShows.length === 0 && playlists.length === 0;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">My List</h1>
        <p className="mt-1 text-sm text-cream/60">
          Your watch statuses, favorite shows, and playlists — all in one place.
        </p>
      </div>

      {empty ? (
        <EmptyState
          emoji="🌱"
          title="Your list is empty"
          hint="Set a watch status on any episode, favorite a show, or start a playlist and it all shows up here."
        >
          <ButtonLink href="/discover" size="sm">
            Find something to watch
          </ButtonLink>
        </EmptyState>
      ) : null}

      {groups.map(({ status, videos }) => (
        <section key={status}>
          <SectionHeading title={`${statusEmoji[status] ?? ""} ${status}`} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <div key={v.id} className="space-y-2">
                <VideoCard video={v} />
                <WatchStatusSelect
                  videoId={v.id}
                  initialStatus={status}
                  signedIn
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {favoriteShows.length > 0 ? (
        <section>
          <SectionHeading title="💜 Favorite shows" />
          <div className="flex flex-wrap gap-2">
            {favoriteShows.map((s) => (
              <Link
                key={s.showSlug}
                href={`/shows/${s.showSlug}`}
                className="rounded-full border-2 border-osc-purple/60 px-4 py-1.5 text-sm font-bold text-cream hover:bg-osc-purple/20"
              >
                {s.showTitle}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {playlists.length > 0 ? (
        <section>
          <SectionHeading title="🎞️ Your playlists" href="/playlists" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
