import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { restorePlaylistRevision } from "@/actions/playlists";
import { parseItemsJson } from "@/lib/revisions";
import { formatDate } from "@/lib/format";
import { RestoreRevisionButton } from "@/components/shared/restore-revision-button";

export const metadata: Metadata = { title: "Playlist History" };

export default async function PlaylistHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isPublic: true,
      userId: true,
      user: { select: { username: true } },
    },
  });
  if (!playlist) notFound();

  const isOwner = playlist.userId === user?.id || Boolean(user?.isAdmin);
  if (!playlist.isPublic && !isOwner) notFound();
  const canRestore = Boolean(user) && (isOwner || playlist.isPublic);

  const revisions = await prisma.playlistRevision.findMany({
    where: { playlistId: id },
    orderBy: { createdAt: "desc" },
    include: { editor: { select: { username: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream">Version history</h1>
        <p className="mt-1 text-sm text-cream/60">
          <Link
            href={`/playlists/${playlist.id}`}
            className="font-bold text-osc-blue hover:underline"
          >
            ← back to “{playlist.name}”
          </Link>{" "}
          by @{playlist.user.username}
        </p>
        <p className="mt-2 rounded-2xl border border-osc-green/30 bg-osc-green/5 px-4 py-3 text-xs text-cream/70">
          🌱 Every edit to this playlist is saved here. Got griefed? Restore any
          earlier version — restores are versioned too, so nothing is ever lost.
        </p>
      </div>

      {revisions.length === 0 ? (
        <p className="text-sm text-cream/50">
          No saved versions yet — history starts with the first edit.
        </p>
      ) : (
        <ol className="space-y-2">
          {revisions.map((rev, i) => {
            const itemCount = parseItemsJson(rev.itemsJson).length;
            return (
              <li key={rev.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cream/50">
                  <span className="font-bold text-cream/80">
                    {formatDate(rev.createdAt)}
                  </span>
                  <span>
                    by{" "}
                    {rev.editor ? (
                      <Link
                        href={`/profile/${rev.editor.username}`}
                        className="font-bold text-cream/80 hover:text-osc-blue"
                      >
                        @{rev.editor.username}
                      </Link>
                    ) : (
                      "unknown"
                    )}
                  </span>
                  {rev.note ? (
                    <span className="rounded-full bg-osc-purple/20 px-2 py-0.5 font-bold text-[#b795ff]">
                      {rev.note}
                    </span>
                  ) : null}
                  <span className="ml-auto">
                    {i === 0 ? (
                      <span className="rounded-full bg-osc-green/15 px-2.5 py-1 text-xs font-bold text-osc-green">
                        ✓ current
                      </span>
                    ) : canRestore ? (
                      <RestoreRevisionButton
                        action={restorePlaylistRevision.bind(null, rev.id)}
                      />
                    ) : null}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-cream">{rev.name}</p>
                <p className="text-xs text-cream/50">
                  {itemCount} video{itemCount === 1 ? "" : "s"}
                  {rev.description ? ` · ${rev.description}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
