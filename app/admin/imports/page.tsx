import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Imports" };

export default async function AdminImportsPage() {
  await requireAdmin();
  const imports = await prisma.playlistImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { username: true } } },
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl text-cream">Playlist imports</h2>
      <ul className="space-y-2">
        {imports.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={row.status === "completed" ? "green" : "yellow"}>{row.status}</Badge>
              <h3 className="font-bold text-cream">{row.playlistTitle}</h3>
            </div>
            <p className="mt-1 text-xs text-cream/50">
              YouTube playlist {row.youtubePlaylistId} · {row.videoCount} found ·{" "}
              {row.importedCount} new · {row.skippedDuplicateCount} duplicates ·{" "}
              imported by @{row.user.username} on {formatDate(row.createdAt)}
            </p>
            {row.playlistDescription ? (
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-cream/60">
                {row.playlistDescription}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
