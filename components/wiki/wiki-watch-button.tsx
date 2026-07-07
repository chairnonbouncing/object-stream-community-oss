"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWikiPageWatch } from "@/actions/wiki";
import { cn } from "@/lib/cn";

export function WikiWatchButton({
  wikiPageId,
  slug,
  initialWatching,
  signedIn,
}: {
  wikiPageId: string;
  slug: string;
  initialWatching: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(initialWatching);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={watching}
      onClick={() => {
        if (!signedIn) {
          router.push(`/signin?callbackUrl=${encodeURIComponent(`/wiki/${slug}`)}`);
          return;
        }
        startTransition(async () => {
          const result = await toggleWikiPageWatch(wikiPageId, slug);
          if (result.ok) setWatching((value) => !value);
        });
      }}
      className={cn(
        "rounded-full border-2 px-4 py-2 text-sm font-bold transition disabled:opacity-50",
        watching
          ? "border-osc-blue bg-osc-blue/15 text-osc-blue"
          : "border-white/30 text-white/70 hover:border-osc-blue/60 hover:text-osc-blue"
      )}
    >
      {watching ? "Watching" : "Watch"}
    </button>
  );
}
