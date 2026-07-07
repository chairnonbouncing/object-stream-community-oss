"use client";

import { useActionState } from "react";
import { signup } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />
      <Field
        label="Username"
        htmlFor="username"
        hint="letters, numbers, underscores"
        errors={state?.fieldErrors?.username}
      >
        <Input id="username" name="username" autoComplete="username" required autoFocus />
      </Field>
      <Field
        label="Email"
        htmlFor="email"
        hint="optional"
        errors={state?.fieldErrors?.email}
      >
        <Input id="email" name="email" type="email" autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="password" errors={state?.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field
        label="Confirm password"
        htmlFor="confirm"
        errors={state?.fieldErrors?.confirm}
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create Account"}
      </Button>
    </form>
  );
}
