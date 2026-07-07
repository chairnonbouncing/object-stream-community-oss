"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setWatchStatus } from "@/actions/watch-status";
import { splitTags } from "@/lib/format";
import { Badge, tagColor } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type HeroItem = {
  id: string;
  title: string;
  showTitle: string;
  showSlug: string;
  description: string | null;
  genreTags: string;
  thumb: string;
};

function AddToMyListButton({ videoId, signedIn }: { videoId: string; signedIn: boolean }) {
  const router = useRouter();
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending || added}
      onClick={() => {
        if (!signedIn) {
          router.push(`/signin?callbackUrl=%2F`);
          return;
        }
        startTransition(async () => {
          const result = await setWatchStatus(videoId, "Plan to Watch");
          if (result.ok) setAdded(true);
        });
      }}
      className="inline-flex h-12 items-center gap-2 rounded-full bg-white/15 px-6 text-base font-bold text-white backdrop-blur transition hover:bg-white/25 disabled:pointer-events-none"
    >
      {added ? "✓ On your list" : "＋ Add to My List"}
    </button>
  );
}

export function HeroCarousel({
  items,
  signedIn,
}: {
  items: HeroItem[];
  signedIn: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 6500);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  if (items.length === 0) return null;
  const item = items[index];

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <h1 className="mb-4 font-display text-3xl text-cream sm:text-4xl">
        Today&apos;s Picks:
      </h1>
      <div className="relative overflow-hidden rounded-[2rem] border-2 border-white/80 shadow-2xl shadow-osc-purple/20">
        {/* Backdrop */}
        <img
          key={item.id}
          src={item.thumb}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/15" />

        <div className="relative flex min-h-80 flex-col justify-end gap-3 p-6 sm:min-h-96 sm:max-w-xl sm:p-10">
          <p className="text-sm font-bold text-white/70">{item.showTitle}</p>
          <h2 className="font-display text-4xl text-white text-shadow-pop sm:text-5xl">
            {item.title}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {splitTags(item.genreTags)
              .slice(0, 3)
              .map((tag) => (
                <Badge key={tag} color={tagColor(tag)} className="bg-black/40">
                  {tag}
                </Badge>
              ))}
          </div>
          {item.description ? (
            <p className="line-clamp-2 max-w-lg text-sm text-white/85">
              {item.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/watch/${item.id}`} size="lg">
              ▶ Let&apos;s Watch!
            </ButtonLink>
            <AddToMyListButton key={item.id} videoId={item.id} signedIn={signedIn} />
            <Link
              href={`/shows/${item.showSlug}`}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 font-serif text-lg italic text-white backdrop-blur transition hover:bg-black/70"
              aria-label={`About ${item.showTitle}`}
              title={`About ${item.showTitle}`}
            >
              i
            </Link>
          </div>
        </div>

        {items.length > 1 ? (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/60"
                )}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
