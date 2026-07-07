"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { togglePlaylistFollow } from "@/actions/playlists";
import { cn } from "@/lib/cn";

export function PlaylistFollowButton({
  playlistId,
  initialFollowing,
  signedIn,
}: {
  playlistId: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={following}
      onClick={() => {
        if (!signedIn) {
          router.push(`/signin?callbackUrl=${encodeURIComponent(`/playlists/${playlistId}`)}`);
          return;
        }
        startTransition(async () => {
          const result = await togglePlaylistFollow(playlistId);
          if (result.ok) setFollowing((value) => !value);
        });
      }}
      className={cn(
        "rounded-full border-2 px-4 py-2 text-sm font-bold transition disabled:opacity-50",
        following
          ? "border-osc-green bg-osc-green/15 text-osc-green"
          : "border-white/30 text-white/70 hover:border-osc-green/60 hover:text-osc-green"
      )}
    >
      {following ? "Saved" : "Save"}
    </button>
  );
}
