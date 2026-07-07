import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { restoreVideoRevision } from "@/actions/videos";
import { episodeLabel, formatDate } from "@/lib/format";
import { VideoEditForm } from "@/components/admin/video-edit-form";
import { RestoreRevisionButton } from "@/components/shared/restore-revision-button";
import { GenreChips } from "@/components/video/genre-chips";

export const metadata: Metadata = { title: "Edit Video Info" };

export default async function EditVideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const user = await requireUser(`/watch/${videoId}/edit`);

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || (video.isHidden && !user.isAdmin)) notFound();

  const revisions = await prisma.videoRevision.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    include: { editor: { select: { username: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl text-cream">Edit video info</h1>
        <p className="mt-1 text-sm text-cream/60">
          <Link href={`/watch/${video.id}`} className="font-bold text-osc-blue hover:underline">
            ← back to {video.episodeTitle ?? video.showTitle}
          </Link>
        </p>
        <p className="mt-2 rounded-2xl border border-osc-green/30 bg-osc-green/5 px-4 py-3 text-xs text-cream/70">
          🌱 This catalog is a community wiki — anyone signed in can fix metadata.
          Every change is saved below, so nothing is ever lost. (The video link
          itself can&apos;t be changed; if it&apos;s wrong, report it.)
        </p>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-6">
        <VideoEditForm video={video} />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-cream">
          Version history{" "}
          <span className="text-base text-cream/40">({revisions.length})</span>
        </h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-cream/50">
            No edits yet — the original submission is the current version.
          </p>
        ) : (
          <ol className="space-y-2">
            {revisions.map((rev, i) => {
              const label = episodeLabel(rev);
              return (
                <li
                  key={rev.id}
                  className="rounded-2xl border border-line bg-surface p-4"
                >
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
                      ) : (
                        <RestoreRevisionButton
                          action={restoreVideoRevision.bind(null, rev.id)}
                        />
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-bold text-cream">
                    {rev.showTitle}
                    {rev.episodeTitle ? ` — ${rev.episodeTitle}` : ""}
                    {label ? (
                      <span className="ml-2 font-normal text-cream/50">{label}</span>
                    ) : null}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cream/50">
                    <span>{rev.status}</span>
                    {rev.releaseYear ? <span>{rev.releaseYear}</span> : null}
                    <span>{rev.language}</span>
                    {rev.genreTags ? (
                      <GenreChips genreTags={rev.genreTags} linked={false} limit={4} />
                    ) : null}
                  </div>
                  {rev.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-cream/50">
                      {rev.description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
