"use client";

import { useActionState } from "react";
import { createPlaylist, updatePlaylist } from "@/actions/playlists";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

export function PlaylistForm({
  playlist,
  showVisibility = true,
}: {
  /** Present = edit mode; absent = create mode. */
  playlist?: { id: string; name: string; description: string | null; isPublic: boolean };
  /** Community editors can change name/description but never visibility. */
  showVisibility?: boolean;
}) {
  const action = playlist ? updatePlaylist.bind(null, playlist.id) : createPlaylist;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />
      <Field label="Playlist name" htmlFor="pl-name" errors={state?.fieldErrors?.name}>
        <Input
          id="pl-name"
          name="name"
          defaultValue={playlist?.name ?? ""}
          placeholder="Season 1 marathon"
          maxLength={80}
          required
        />
      </Field>
      <Field
        label="Description"
        htmlFor="pl-desc"
        hint="optional"
        errors={state?.fieldErrors?.description}
      >
        <Textarea
          id="pl-desc"
          name="description"
          defaultValue={playlist?.description ?? ""}
          placeholder="What's this playlist about?"
          maxLength={500}
          className="min-h-16"
        />
      </Field>
      {showVisibility ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-cream/85">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={playlist?.isPublic ?? true}
            className="h-4 w-4 accent-osc-purple"
          />
          Public — everyone can see and watch this playlist
        </label>
      ) : null}
      <Button type="submit" variant="accent" size="sm" disabled={pending}>
        {pending ? "Saving…" : playlist ? "Save changes" : "Create playlist"}
      </Button>
    </form>
  );
}
