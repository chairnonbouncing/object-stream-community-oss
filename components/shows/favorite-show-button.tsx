"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavoriteShow } from "@/actions/favorites";
import { cn } from "@/lib/cn";

export function FavoriteShowButton({
  showSlug,
  showTitle,
  initialFavorited,
  signedIn,
}: {
  showSlug: string;
  showTitle: string;
  initialFavorited: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (!signedIn) {
          router.push(`/signin?callbackUrl=${encodeURIComponent(`/shows/${showSlug}`)}`);
          return;
        }
        startTransition(async () => {
          const result = await toggleFavoriteShow(showSlug, showTitle);
          if (result.ok) setFavorited((v) => !v);
        });
      }}
      disabled={pending}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl transition",
        favorited
          ? "border-osc-red bg-osc-red/20 text-osc-red"
          : "border-white/30 text-white/70 hover:border-osc-red/60 hover:text-osc-red"
      )}
      title={favorited ? "Remove from favorite shows" : "Add to favorite shows"}
      aria-pressed={favorited}
    >
      {favorited ? "♥" : "♡"}
    </button>
  );
}
