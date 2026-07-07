"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />
      <Field
        label="Current password"
        htmlFor="pw-current"
        errors={state?.fieldErrors?.current}
      >
        <Input
          id="pw-current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="pw-next"
        hint="at least 8 characters"
        errors={state?.fieldErrors?.next}
      >
        <Input
          id="pw-next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="pw-confirm"
        errors={state?.fieldErrors?.confirm}
      >
        <Input
          id="pw-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function EditProfileForm({
  avatarUrl,
  bio,
}: {
  avatarUrl: string;
  bio: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />
      <Field
        label="Avatar URL"
        htmlFor="avatarUrl"
        hint="link to an image, optional"
        errors={state?.fieldErrors?.avatarUrl}
      >
        <Input
          id="avatarUrl"
          name="avatarUrl"
          defaultValue={avatarUrl}
          placeholder="https://…"
        />
      </Field>
      <Field
        label="Bio"
        htmlFor="bio"
        hint="max 500 chars"
        errors={state?.fieldErrors?.bio}
      >
        <Textarea
          id="bio"
          name="bio"
          defaultValue={bio}
          maxLength={500}
          placeholder="Which object show got you into the fandom?"
        />
      </Field>
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
