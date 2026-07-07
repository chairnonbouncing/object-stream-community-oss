import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminDashboard() {
  await requireAdmin();

  const [videos, hiddenVideos, featured, reviews, hiddenReviews, reports, users] =
    await Promise.all([
      prisma.video.count(),
      prisma.video.count({ where: { isHidden: true } }),
      prisma.video.count({ where: { isFeatured: true } }),
      prisma.review.count(),
      prisma.review.count({ where: { isHidden: true } }),
      prisma.report.count(),
      prisma.user.count(),
    ]);

  const cards = [
    { label: "Videos", value: videos, href: "/admin/videos", accent: "text-osc-blue" },
    { label: "Hidden videos", value: hiddenVideos, href: "/admin/videos?hidden=1", accent: "text-osc-red" },
    { label: "Featured", value: featured, href: "/admin/videos?featured=1", accent: "text-osc-star" },
    { label: "Reviews", value: reviews, href: "/admin/reviews", accent: "text-osc-green" },
    { label: "Hidden reviews", value: hiddenReviews, href: "/admin/reviews?hidden=1", accent: "text-osc-red" },
    { label: "Open reports", value: reports, href: "/admin/reports", accent: "text-osc-red" },
    { label: "Users", value: users, href: "/admin", accent: "text-[#b795ff]" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="rounded-2xl border border-line bg-surface px-4 py-4 text-center transition hover:border-osc-purple/60"
        >
          <p className={`font-display text-3xl ${c.accent}`}>{c.value}</p>
          <p className="text-xs font-bold text-cream/50">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}
