"use client";

import Link from "next/link";
import { useTransition } from "react";
import { moveItem, removeFromPlaylist } from "@/actions/playlists";
import { cn } from "@/lib/cn";

export function PlaylistItemRow({
  itemId,
  playlistId,
  videoId,
  index,
  isFirst,
  isLast,
  title,
  showTitle,
  ageRangeTag,
  thumb,
}: {
  itemId: string;
  playlistId: string;
  videoId: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  title: string;
  showTitle: string;
  ageRangeTag: string;
  thumb: string;
}) {
  const [pending, startTransition] = useTransition();

  const arrowClasses =
    "flex h-7 w-7 items-center justify-center rounded-lg border border-line text-xs text-cream/70 transition hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none";

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5",
        pending && "opacity-50"
      )}
    >
      <span className="w-6 shrink-0 text-center text-sm font-bold text-cream/40">
        {index + 1}
      </span>
      <Link href={`/watch/${videoId}?list=${playlistId}`} className="shrink-0">
        <img
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-14 w-24 rounded-lg object-cover"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/watch/${videoId}?list=${playlistId}`}
          className="block truncate text-sm font-bold text-cream hover:text-osc-blue"
        >
          {title}
        </Link>
        <p className="truncate text-xs text-cream/50">
          {showTitle} · {ageRangeTag}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          className={arrowClasses}
          disabled={isFirst || pending}
          onClick={() => startTransition(async () => void (await moveItem(itemId, "up")))}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          className={arrowClasses}
          disabled={isLast || pending}
          onClick={() =>
            startTransition(async () => void (await moveItem(itemId, "down")))
          }
          aria-label="Move down"
        >
          ▼
        </button>
        <button
          className={cn(arrowClasses, "text-osc-red hover:bg-osc-red/10")}
          disabled={pending}
          onClick={() =>
            startTransition(async () => void (await removeFromPlaylist(itemId)))
          }
          aria-label="Remove from playlist"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
