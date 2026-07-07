"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/shows", label: "Shows" },
  { href: "/wiki", label: "Wiki" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/playlists", label: "Playlists" },
  { href: "/my-list", label: "My List" },
  { href: "/submit", label: "Submit" },
  { href: "/import/youtube-playlist", label: "Import" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {links.map(({ href, label }) => {
        const active =
          href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              active
                ? "bg-white text-night shadow"
                : "text-cream/80 hover:bg-white/10 hover:text-cream"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
