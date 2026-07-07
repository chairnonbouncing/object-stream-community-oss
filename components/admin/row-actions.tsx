"use client";

import { useState, useTransition } from "react";
import {
  adminDeleteReview,
  adminDeleteVideo,
  adminDismissReport,
  adminSetFeatured,
  adminSetReviewHidden,
  adminSetVideoHidden,
} from "@/actions/admin";
import { cn } from "@/lib/cn";

const chip =
  "rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40";

function useConfirmedAction() {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  return { pending, startTransition, armed, setArmed };
}

export function AdminVideoActions({
  videoId,
  isHidden,
  isFeatured,
}: {
  videoId: string;
  isHidden: boolean;
  isFeatured: boolean;
}) {
  const { pending, startTransition, armed, setArmed } = useConfirmedAction();

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => void (await adminSetFeatured(videoId, !isFeatured)))
        }
        className={cn(
          chip,
          isFeatured
            ? "border-osc-star bg-osc-star/15 text-osc-star"
            : "border-line text-cream/60 hover:border-osc-star/60 hover:text-osc-star"
        )}
      >
        {isFeatured ? "★ Featured" : "☆ Feature"}
      </button>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => void (await adminSetVideoHidden(videoId, !isHidden)))
        }
        className={cn(
          chip,
          isHidden
            ? "border-osc-red bg-osc-red/15 text-osc-red"
            : "border-line text-cream/60 hover:border-osc-red/60 hover:text-osc-red"
        )}
      >
        {isHidden ? "🚫 Hidden" : "Hide"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            setTimeout(() => setArmed(false), 3000);
            return;
          }
          startTransition(async () => void (await adminDeleteVideo(videoId)));
        }}
        className={cn(
          chip,
          armed
            ? "border-osc-red bg-osc-red text-white"
            : "border-osc-red/50 text-osc-red hover:bg-osc-red/10"
        )}
      >
        {armed ? "Sure?" : "Delete"}
      </button>
    </span>
  );
}

export function AdminReviewActions({
  reviewId,
  isHidden,
}: {
  reviewId: string;
  isHidden: boolean;
}) {
  const { pending, startTransition, armed, setArmed } = useConfirmedAction();

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(
            async () => void (await adminSetReviewHidden(reviewId, !isHidden))
          )
        }
        className={cn(
          chip,
          isHidden
            ? "border-osc-red bg-osc-red/15 text-osc-red"
            : "border-line text-cream/60 hover:border-osc-red/60 hover:text-osc-red"
        )}
      >
        {isHidden ? "🚫 Hidden" : "Hide"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            setTimeout(() => setArmed(false), 3000);
            return;
          }
          startTransition(async () => void (await adminDeleteReview(reviewId)));
        }}
        className={cn(
          chip,
          armed
            ? "border-osc-red bg-osc-red text-white"
            : "border-osc-red/50 text-osc-red hover:bg-osc-red/10"
        )}
      >
        {armed ? "Sure?" : "Delete"}
      </button>
    </span>
  );
}

export function AdminReportActions({ reportId }: { reportId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => void (await adminDismissReport(reportId)))
      }
      className={cn(chip, "border-osc-green/60 text-osc-green hover:bg-osc-green/10")}
    >
      ✓ Dismiss
    </button>
  );
}
