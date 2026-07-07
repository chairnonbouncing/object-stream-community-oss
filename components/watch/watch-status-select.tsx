"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setWatchStatus } from "@/actions/watch-status";
import { WATCH_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/cn";

export function WatchStatusSelect({
  videoId,
  initialStatus,
  signedIn,
  className,
}: {
  videoId: string;
  initialStatus: string | null;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status ?? ""}
      disabled={pending}
      onChange={(e) => {
        if (!signedIn) {
          router.push(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
          return;
        }
        const value = e.target.value || null;
        startTransition(async () => {
          const result = await setWatchStatus(videoId, value);
          if (result.ok) setStatus(value);
        });
      }}
      className={cn(
        "cursor-pointer rounded-full border-2 bg-surface px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-osc-purple/40",
        status
          ? "border-osc-green/60 text-osc-green"
          : "border-line text-cream/70",
        className
      )}
      aria-label="Watch status"
    >
      <option value="">{status ? "✕ Clear status" : "＋ Set watch status"}</option>
      {WATCH_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
