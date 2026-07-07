import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { AdminUserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      createdAt: true,
      _count: { select: { videos: true, playlists: true, reviews: true } },
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-cream/50">
        Backup-restored accounts reset their own passwords at sign-in — no
        action needed. “Temp password” is only for someone who forgot theirs
        later: hand it over and tell them to change it in Edit Profile.
      </p>
      <ul className="space-y-2">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3"
          >
            <Link
              href={`/profile/${u.username}`}
              className="font-bold text-cream hover:text-osc-blue"
            >
              @{u.username}
            </Link>
            {u.isAdmin ? <Badge color="red">mod</Badge> : null}
            <span className="text-xs text-cream/50">
              joined {formatDate(u.createdAt)} · {u._count.videos} videos ·{" "}
              {u._count.playlists} playlists · {u._count.reviews} reviews
            </span>
            <span className="ml-auto">
              <AdminUserActions userId={u.id} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
