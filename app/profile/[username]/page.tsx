import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { getProfileByUsername } from "@/lib/queries/profile";
import { formatMonthYear } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatCards } from "@/components/profile/stat-cards";
import { VideoRow } from "@/components/video/video-row";
import { PlaylistCard } from "@/components/playlists/playlist-card";

type Params = Promise<{ username: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username.toLowerCase()}` };
}

export default async function ProfilePage({ params }: { params: Params }) {
  const { username } = await params;
  const viewer = await getSessionUser();
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const isSelf = viewer?.id === profile.id;

  return (
    <div className="space-y-10">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-osc-purple bg-surface-2 font-display text-3xl text-cream">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              profile.username.slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl text-cream">@{profile.username}</h1>
              {profile.isAdmin ? <Badge color="red">mod</Badge> : null}
            </div>
            <p className="text-xs text-cream/50">
              Joined {formatMonthYear(profile.createdAt)}
            </p>
            {profile.bio ? (
              <p className="max-w-xl text-sm text-cream/75">{profile.bio}</p>
            ) : null}
          </div>
          {isSelf ? (
            <ButtonLink href="/profile/edit" variant="outline" size="sm">
              ✎ Edit profile
            </ButtonLink>
          ) : null}
        </div>
        <div className="mt-6">
          <StatCards stats={profile.stats} />
        </div>
      </div>

      {profile.favoriteShows.length > 0 ? (
        <section>
          <SectionHeading title="💜 Favorite shows" />
          <div className="flex flex-wrap gap-2">
            {profile.favoriteShows.map((s) => (
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

      <VideoRow
        title={`Submitted (${profile.submittedTotal})`}
        videos={profile.submittedVideos}
      />
      {profile.publicPlaylists.length > 0 ? (
        <section>
          <SectionHeading title="Public playlists" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {profile.publicPlaylists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
