"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { submitReport } from "@/actions/reports";

type ReportTargetType = "video" | "review" | "wiki_page" | "wiki_discussion" | "wiki_image";

export function ReportButton({
  targetType,
  targetId,
  signedIn,
}: {
  targetType: ReportTargetType;
  targetId: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (message) {
    return <span className="text-xs text-cream/50">{message}</span>;
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => {
          if (!signedIn) {
            router.push(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
            return;
          }
          setOpen((v) => !v);
        }}
        className="text-xs font-bold text-cream/40 hover:text-osc-red"
      >
        ⚑ Report
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await submitReport(
                  targetType,
                  targetId,
                  reason.trim() || undefined
                );
                setMessage(result.ok ? result.message ?? "Reported" : result.error);
                setOpen(false);
              });
            }}
            className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-surface-2 p-3 shadow-xl shadow-black/50"
          >
            <label className="mb-1 block text-xs font-bold text-cream/70">
              Why report this {targetType.replaceAll("_", " ")}?
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional reason…"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-2 w-full rounded-lg bg-osc-red/90 py-1.5 text-sm font-bold text-white hover:bg-osc-red disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send report"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
