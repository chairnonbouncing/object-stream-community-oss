import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";

// Defense in depth: every admin page ALSO calls requireAdmin, and every admin
// action re-checks on the server. This layout is just the front door.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-osc-red/30 bg-osc-red/5 px-5 py-4">
        <h1 className="font-display text-2xl text-cream">🛡️ Mod Zone</h1>
        <nav className="flex flex-wrap gap-1 text-sm font-bold" aria-label="Admin">
          <Link href="/admin" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Dashboard
          </Link>
          <Link href="/admin/videos" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Videos
          </Link>
          <Link href="/admin/reviews" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Reviews
          </Link>
          <Link href="/admin/reports" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Reports
          </Link>
          <Link href="/admin/wiki" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Wiki
          </Link>
          <Link href="/admin/imports" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Imports
          </Link>
          <Link href="/admin/users" className="rounded-full px-3 py-1.5 text-cream/80 hover:bg-white/10">
            Users
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
