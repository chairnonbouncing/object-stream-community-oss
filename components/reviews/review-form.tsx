"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitReview, type ReviewFormState } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export function ReviewForm({
  videoId,
  existing,
  signedIn,
}: {
  videoId: string;
  existing: { text: string; rating: number | null } | null;
  signedIn: boolean;
}) {
  const action = submitReview.bind(null, videoId);
  const [state, formAction, pending] = useActionState<ReviewFormState, FormData>(
    action,
    undefined
  );
  const [stars, setStars] = useState<number | null>(existing?.rating ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isNew = !existing;

  useEffect(() => {
    if (state?.saved && isNew) formRef.current?.reset();
  }, [state, isNew]);

  if (!signedIn) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-cream/60">
        <Link href="/signin" className="font-bold text-osc-blue hover:underline">
          Sign in
        </Link>{" "}
        to rate and review this episode.
      </p>
    );
  }

  const display = hover ?? stars ?? 0;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <FormError message={state?.error} />
      {state?.saved ? (
        <p className="text-sm font-bold text-osc-green">
          {existing ? "Review updated!" : "Review posted!"} 🎉
        </p>
      ) : null}

      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs font-bold text-cream/60">Stars (optional):</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setStars((cur) => (cur === s ? null : s))}
            className={cn(
              "text-xl transition hover:scale-125",
              s <= display ? "text-osc-star" : "text-white/25"
            )}
            aria-label={`${s} star${s === 1 ? "" : "s"}`}
          >
            ★
          </button>
        ))}
        <input type="hidden" name="rating" value={stars ?? ""} />
      </div>

      <Field
        label={existing ? "Update your review" : "Write a review"}
        htmlFor="review-text"
        errors={state?.fieldErrors?.text}
      >
        <Textarea
          id="review-text"
          name="text"
          defaultValue={existing?.text ?? ""}
          placeholder="What did you think? No spoilers without warning!"
          maxLength={2000}
          required
        />
      </Field>

      <Button type="submit" variant="accent" size="sm" disabled={pending}>
        {pending ? "Saving…" : existing ? "Update review" : "Post review"}
      </Button>
    </form>
  );
}
