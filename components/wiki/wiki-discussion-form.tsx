"use client";

import { useActionState } from "react";
import { addWikiDiscussion } from "@/actions/wiki";
import { Button } from "@/components/ui/button";
import { Field, FormError, Textarea } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

export function WikiDiscussionForm({
  wikiPageId,
  slug,
}: {
  wikiPageId: string;
  slug: string;
}) {
  const action = addWikiDiscussion.bind(null, wikiPageId, slug);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
      <FormError message={state?.error} />
      <Field label="Add to the discussion" htmlFor="text" errors={state?.fieldErrors?.text}>
        <Textarea id="text" name="text" placeholder="Accuracy notes, sources, disputes, or missing info..." />
      </Field>
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Posting..." : "Post"}
      </Button>
    </form>
  );
}
