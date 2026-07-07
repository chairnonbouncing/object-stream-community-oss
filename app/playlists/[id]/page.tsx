import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { getPlaylistWithItems } from "@/lib/queries/playlists";
import { deletePlaylist } from "@/actions/playlists";
import { resolveThumbnail } from "@/lib/video-url";
import { formatCount, formatDate, formatRuntime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaylistForm } from "@/components/playlists/playlist-form";
import { PlaylistItemRow } from "@/components/playlists/playlist-item-row";
import { VideoCard } from "@/components/video/video-card";
import { PlaylistFollowButton } from "@/components/playlists/playlist-follow-button";
import { PublicViewTracker } from "@/components/shared/public-view-tracker";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const playlist = await getPlaylistWithItems(id);
  return { title: playlist?.name ?? "Playlist not found" };
}

export default async function PlaylistPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await getSessionUser();
  const playlist = await getPlaylistWithItems(id, user?.id);
  if (!playlist) notFound();

  const isOwner = playlist.userId === user?.id || Boolean(user?.isAdmin);
  if (!playlist.isPublic && !isOwner) notFound();
  // Wiki rule: any signed-in user may edit public playlists (fully versioned).
  const canEdit = Boolean(user) && (isOwner || playlist.isPublic);

  return (
    <div className="space-y-8">
      {playlist.isPublic ? <PublicViewTracker kind="playlist" targetId={playlist.id} /> : null}
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl text-cream sm:text-4xl">
                {playlist.name}
              </h1>
              {!playlist.isPublic ? <Badge color="yellow">🔒 private</Badge> : null}
            </div>
            {playlist.description ? (
              <p className="max-w-2xl text-sm text-cream/70">{playlist.description}</p>
            ) : null}
            <p className="text-xs text-cream/50">
              {playlist.items.length} video{playlist.items.length === 1 ? "" : "s"} · by{" "}
              <Link
                href={`/profile/${playlist.ownerUsername}`}
                className="font-bold text-cream/70 hover:text-osc-blue"
              >
                @{playlist.ownerUsername}
              </Link>{" "}
              · updated {formatDate(playlist.updatedAt)} ·{" "}
              <Link
                href={`/playlists/${playlist.id}/history`}
                className="font-bold text-osc-blue hover:underline"
              >
                ⟲ history
              </Link>
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-5">
              {[
                ["Views", formatCount(playlist.viewCount)],
                ["Videos", formatCount(playlist.items.length)],
                ["Saves", formatCount(playlist.followerCount)],
                ["Runtime", formatRuntime(playlist.totalRuntimeSeconds)],
                ["Marked watched", formatCount(playlist.markedWatchedCount)],
              ].map(([labelText, value]) => (
                <div key={labelText} className="rounded-2xl border border-line bg-night/30 px-3 py-2">
                  <p className="text-xs font-bold text-cream/45">{labelText}</p>
                  <p className="font-display text-lg text-cream">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {playlist.items.length > 0 ? (
              <ButtonLink
                href={`/watch/${playlist.items[0].video.id}?list=${playlist.id}`}
                size="lg"
              >
                ▶ Play All
              </ButtonLink>
            ) : null}
            {playlist.isPublic ? (
              <PlaylistFollowButton
                playlistId={playlist.id}
                initialFollowing={playlist.isFollowing}
                signedIn={Boolean(user)}
              />
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <details className="min-w-64 flex-1">
              <summary className="cursor-pointer select-none text-sm font-bold text-osc-blue hover:underline">
                ✎ Edit name &amp; description
                {isOwner ? " & visibility" : ""}
              </summary>
              <div className="mt-3 max-w-md">
                <PlaylistForm
                  playlist={{
                    id: playlist.id,
                    name: playlist.name,
                    description: playlist.description,
                    isPublic: playlist.isPublic,
                  }}
                  showVisibility={isOwner}
                />
              </div>
            </details>
            {isOwner ? (
              <form
                action={async () => {
                  "use server";
                  await deletePlaylist(playlist.id);
                }}
              >
                <ConfirmButton confirmLabel="Really delete?">
                  Delete playlist
                </ConfirmButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {canEdit && !isOwner ? (
          <p className="mt-3 text-xs text-cream/45">
            🌱 Community playlist — anyone signed in can edit it. Every change lands
            in the{" "}
            <Link
              href={`/playlists/${playlist.id}/history`}
              className="font-bold text-osc-blue hover:underline"
            >
              version history
            </Link>
            , so the owner can always roll back.
          </p>
        ) : null}
      </div>

      {playlist.items.length === 0 ? (
        <EmptyState
          emoji="📼"
          title="This playlist is empty"
          hint={
            canEdit
              ? "Open any video and use “＋ Add to playlist” to fill it up."
              : "Nothing here yet."
          }
        >
          {canEdit ? (
            <ButtonLink href="/discover" size="sm">
              Browse the catalog
            </ButtonLink>
          ) : null}
        </EmptyState>
      ) : canEdit ? (
        <ol className="max-w-3xl space-y-2">
          {playlist.items.map((item, i) => (
            <PlaylistItemRow
              key={item.itemId}
              itemId={item.itemId}
              playlistId={playlist.id}
              videoId={item.video.id}
              index={i}
              isFirst={i === 0}
              isLast={i === playlist.items.length - 1}
              title={item.video.episodeTitle ?? item.video.showTitle}
              showTitle={item.video.showTitle}
              ageRangeTag={item.video.ageRangeTag}
              thumb={resolveThumbnail(item.video)}
            />
          ))}
        </ol>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {playlist.items.map((item) => (
            <VideoCard
              key={item.itemId}
              video={item.video}
              watchParams={`list=${playlist.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
