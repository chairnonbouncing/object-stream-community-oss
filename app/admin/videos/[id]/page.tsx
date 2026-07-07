import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VideoEditForm } from "@/components/admin/video-edit-form";

export const metadata: Metadata = { title: "Admin · Edit Video" };

export default async function AdminVideoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-display text-2xl text-cream">Edit metadata</h2>
        <p className="mt-1 text-xs text-cream/50">
          {video.provider} · <code className="text-cream/70">{video.providerVideoId}</code>{" "}
          ·{" "}
          <Link href={`/watch/${video.id}`} className="text-osc-blue hover:underline">
            open watch page →
          </Link>
        </p>
        <p className="mt-1 text-xs text-cream/40">
          The video link itself can&apos;t be edited — delete and resubmit if it&apos;s
          wrong. Renaming the show automatically regroups it.
        </p>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6">
        <VideoEditForm video={video} />
      </div>
    </div>
  );
}
