"use client";

import { useState } from "react";
import Link from "next/link";
import { logout } from "@/actions/auth";

export function UserMenu({
  username,
  isAdmin,
  avatarUrl,
}: {
  username: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  const itemClasses =
    "block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-cream/85 hover:bg-white/10";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-osc-purple bg-surface-2 font-display text-sm text-cream"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${username}`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          username.slice(0, 1).toUpperCase()
        )}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-line bg-surface-2 p-2 shadow-xl shadow-black/50">
            <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-cream/40">
              @{username}
            </p>
            <Link href={`/profile/${username}`} className={itemClasses} onClick={() => setOpen(false)}>
              My Profile
            </Link>
            <Link href="/my-list" className={itemClasses} onClick={() => setOpen(false)}>
              My List
            </Link>
            <Link href="/submit" className={itemClasses} onClick={() => setOpen(false)}>
              Submit a Video
            </Link>
            {isAdmin ? (
              <Link href="/admin" className={itemClasses} onClick={() => setOpen(false)}>
                Admin
              </Link>
            ) : null}
            <div className="my-1 border-t border-line" />
            <form action={logout}>
              <button type="submit" className={itemClasses}>
                Sign Out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
