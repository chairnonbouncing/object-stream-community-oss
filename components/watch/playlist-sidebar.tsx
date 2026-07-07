import Link from "next/link";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/button";
import type { WatchModeContext } from "@/lib/queries/playlists";

export function PlaylistSidebar({ context }: { context: WatchModeContext }) {
  const { playlistId, playlistName, entries, currentIndex, prevVideoId, nextVideoId } =
    context;

  return (
    <aside className="flex max-h-[80vh] flex-col overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-cream/40">
          Now playing from
        </p>
        <Link
          href={`/playlists/${playlistId}`}
          className="font-display text-lg text-cream hover:text-osc-blue"
        >
          {playlistName}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-cream/50">
            {currentIndex + 1} / {entries.length}
          </span>
          <span className="flex gap-2">
            {prevVideoId ? (
              <ButtonLink
                href={`/watch/${prevVideoId}?list=${playlistId}`}
                variant="ghost"
                size="sm"
              >
                ← Prev
              </ButtonLink>
            ) : null}
            {nextVideoId ? (
              <ButtonLink
                href={`/watch/${nextVideoId}?list=${playlistId}&autoplay=1`}
                variant="primary"
                size="sm"
              >
                Next →
              </ButtonLink>
            ) : null}
          </span>
        </div>
      </div>

      <ol className="hide-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
        {entries.map((entry, i) => {
          const current = i === currentIndex;
          return (
            <li key={entry.videoId}>
              <Link
                href={`/watch/${entry.videoId}?list=${playlistId}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl p-2 transition",
                  current
                    ? "bg-osc-purple/25 ring-1 ring-osc-purple"
                    : "hover:bg-white/5"
                )}
                aria-current={current ? "true" : undefined}
              >
                <span className="w-5 shrink-0 text-center text-xs font-bold text-cream/40">
                  {current ? "▶" : i + 1}
                </span>
                <img
                  src={entry.thumb}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-12 w-20 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-cream">
                    {entry.episodeTitle ?? entry.showTitle}
                  </span>
                  <span className="block truncate text-xs text-cream/50">
                    {entry.showTitle}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
