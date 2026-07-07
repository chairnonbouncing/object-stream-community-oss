import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { splitTags } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { UpcomingShowForm } from "@/components/wiki/upcoming-show-form";

export const metadata: Metadata = { title: "Upcoming Shows" };

export default async function UpcomingPage() {
  const user = await getSessionUser();
  const shows = await prisma.show.findMany({
    where: user?.isAdmin ? { isUpcoming: true } : { isUpcoming: true, isHidden: false },
    orderBy: [{ expectedReleaseDate: "asc" }, { createdAt: "desc" }],
    include: { wikiPages: { select: { slug: true }, take: 1 } },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-cream sm:text-4xl">Upcoming shows</h1>
          <p className="mt-1 max-w-3xl text-sm text-cream/60">
            Track announced Object Shows before release with source links, discussion,
            and community-maintained wiki pages.
          </p>
        </div>
        {!user ? (
          <ButtonLink href="/signin?callbackUrl=/upcoming" variant="accent">
            Sign in to add one
          </ButtonLink>
        ) : null}
      </div>

      {user ? <UpcomingShowForm /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {shows.map((show) => {
          const wikiSlug = show.wikiPages[0]?.slug ?? show.slug;
          return (
            <article key={show.id} className="rounded-3xl border border-line bg-surface p-5">
              <div className="flex gap-4">
                {show.coverImageUrl ? (
                  <img
                    src={show.coverImageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-24 w-36 shrink-0 rounded-2xl object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge color="blue">Upcoming</Badge>
                    <Badge color="yellow">{show.ageRangeTag}</Badge>
                    <Badge color="neutral">{show.language}</Badge>
                  </div>
                  <h2 className="mt-2 truncate font-display text-2xl text-cream">{show.title}</h2>
                  {show.expectedReleaseDate ? (
                    <p className="text-xs text-cream/50">
                      Expected {show.expectedReleaseDate.toLocaleDateString()}
                    </p>
                  ) : null}
                  {show.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-cream/60">{show.description}</p>
                  ) : null}
                  {show.genreTags ? (
                    <p className="mt-2 text-xs text-cream/45">
                      {splitTags(show.genreTags).join(" · ")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex gap-3 text-sm font-bold">
                    <Link href={`/wiki/${wikiSlug}`} className="text-osc-blue hover:underline">
                      Wiki
                    </Link>
                    <Link href={`/wiki/${wikiSlug}/discussion`} className="text-cream/50 hover:text-osc-blue">
                      Discussion
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
