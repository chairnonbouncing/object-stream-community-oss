"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";

/** Runs a bound restore server action; restoring is itself versioned, so a
 *  single click is safe — nothing is ever lost. */
export function RestoreRevisionButton({
  action,
}: {
  action: () => Promise<ActionResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (message) {
    return <span className="text-xs font-bold text-osc-green">{message}</span>;
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await action();
          setMessage(result.ok ? (result.message ?? "Restored!") : result.error);
        })
      }
      className="rounded-full border border-osc-blue/60 px-3 py-1 text-xs font-bold text-osc-blue transition hover:bg-osc-blue/10 disabled:opacity-40"
    >
      {pending ? "Restoring…" : "⟲ Restore"}
    </button>
  );
}
