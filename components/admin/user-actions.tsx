"use client";

import { useState, useTransition } from "react";
import { adminSetTempPassword } from "@/actions/admin";

export function AdminUserActions({ userId }: { userId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (message) {
    return (
      <span className="select-all rounded-lg bg-osc-star/10 px-2 py-1 text-xs font-bold text-osc-star">
        {message}
      </span>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 3000);
          return;
        }
        startTransition(async () => {
          const result = await adminSetTempPassword(userId);
          setMessage(result.ok ? (result.message ?? "Done") : result.error);
        });
      }}
      className={
        armed
          ? "rounded-full bg-osc-star px-3 py-1 text-xs font-bold text-night"
          : "rounded-full border border-osc-star/60 px-3 py-1 text-xs font-bold text-osc-star hover:bg-osc-star/10"
      }
    >
      {pending ? "Working…" : armed ? "Sure? This locks their old password" : "🔑 Temp password"}
    </button>
  );
}
