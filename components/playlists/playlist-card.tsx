import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatDate, formatRuntime } from "@/lib/format";
import type { PlaylistCardData } from "@/lib/queries/playlists";

export function PlaylistCard({ playlist }: { playlist: PlaylistCardData }) {
  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-osc-green/60 hover:shadow-lg hover:shadow-osc-green/10"
    >
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        <img
          src={playlist.coverThumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-bold text-white/90">
          ≡ {playlist.itemCount} video{playlist.itemCount === 1 ? "" : "s"}
        </span>
        {!playlist.isPublic ? (
          <span className="absolute left-2 top-2">
            <Badge color="yellow">🔒 private</Badge>
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate font-display text-base text-cream" title={playlist.name}>
          {playlist.name}
        </p>
        {playlist.description ? (
          <p className="truncate text-xs text-cream/50">{playlist.description}</p>
        ) : null}
        <p className="text-[11px] text-cream/40">
          by @{playlist.ownerUsername} · updated {formatDate(playlist.updatedAt)}
        </p>
        <p className="text-[10px] text-cream/35">
          {formatCount(playlist.viewCount)} views · {formatCount(playlist.followerCount)} saves ·{" "}
          {formatRuntime(playlist.totalRuntimeSeconds)} ·{" "}
          {formatCount(playlist.markedWatchedCount)} watched
        </p>
      </div>
    </Link>
  );
}
