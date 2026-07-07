"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { rateVideo } from "@/actions/ratings";
import { cn } from "@/lib/cn";

export function RateStars({
  videoId,
  initialRating,
  signedIn,
}: {
  videoId: string;
  initialRating: number | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const display = hover ?? rating ?? 0;

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs font-bold text-cream/60">
        {rating ? "Your rating:" : "Rate it:"}
      </span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={pending}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (!signedIn) {
              router.push(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
              return;
            }
            startTransition(async () => {
              const result = await rateVideo(videoId, star);
              if (result.ok) setRating(star);
            });
          }}
          className={cn(
            "text-xl transition hover:scale-125",
            star <= display ? "text-osc-star" : "text-white/25"
          )}
          aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
