"use client";

import { useActionState } from "react";
import { login, reclaimAccount, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

/** Shown when a backup-restored account signs in: their old password is gone,
 *  so they pick a brand-new one right here and keep everything they made. */
function ReclaimForm({ username }: { username: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    reclaimAccount,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="username" value={username} />
      <div className="rounded-2xl border border-osc-star/40 bg-osc-star/10 px-4 py-3 text-sm text-cream/85">
        <p className="font-bold text-osc-star">Welcome back, @{username}! 👋</p>
        <p className="mt-1">
          The site moved to a new database and your old password couldn&apos;t
          come along. Pick a new one below — all your videos, playlists, and
          reviews are safe and still yours.
        </p>
      </div>
      <FormError message={state?.error} />
      <Field
        label="New password"
        htmlFor="reclaim-password"
        hint="at least 8 characters"
        errors={state?.fieldErrors?.password}
      >
        <Input
          id="reclaim-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="reclaim-confirm"
        errors={state?.fieldErrors?.confirm}
      >
        <Input
          id="reclaim-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password & sign in"}
      </Button>
    </form>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  );

  if (state?.needsReset && state.username) {
    return <ReclaimForm username={state.username} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
      <FormError message={state?.error} />
      <Field label="Username" htmlFor="username">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}
