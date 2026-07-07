"use client";

import { useActionState } from "react";
import { createUpcomingShow } from "@/actions/wiki";
import { AGE_RANGE_TAGS, GENRES, LANGUAGES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

export function UpcomingShowForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createUpcomingShow,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5 rounded-3xl border border-line bg-surface p-5">
      <FormError message={state?.error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Show title" htmlFor="title" errors={state?.fieldErrors?.title}>
          <Input id="title" name="title" required />
        </Field>
        <Field label="Creator name" htmlFor="creatorName">
          <Input id="creatorName" name="creatorName" />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Expected release" htmlFor="expectedReleaseDate">
          <Input id="expectedReleaseDate" name="expectedReleaseDate" type="date" />
        </Field>
        <Field label="Language" htmlFor="language">
          <Select id="language" name="language" defaultValue="English">
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Age range" htmlFor="ageRangeTag">
          <Select id="ageRangeTag" name="ageRangeTag" defaultValue="Unknown">
            {AGE_RANGE_TAGS.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Genres" hint="pick up to 5">
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => (
            <label
              key={genre}
              className="cursor-pointer select-none rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-cream/70 transition has-checked:border-osc-purple has-checked:bg-osc-purple/25 has-checked:text-cream"
            >
              <input type="checkbox" name="genres" value={genre} className="sr-only" />
              {genre}
            </label>
          ))}
        </div>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Extra tags" htmlFor="extraTags">
          <Input id="extraTags" name="extraTags" placeholder="pilot, indie" />
        </Field>
        <Field label="Cover image URL" htmlFor="coverImageUrl" errors={state?.fieldErrors?.coverImageUrl}>
          <Input id="coverImageUrl" name="coverImageUrl" placeholder="https://..." />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Trailer link" htmlFor="trailerUrl">
          <Input id="trailerUrl" name="trailerUrl" placeholder="https://..." />
        </Field>
        <Field label="Sources / links" htmlFor="sourceLinks">
          <Input id="sourceLinks" name="sourceLinks" placeholder="Official post, announcement..." />
        </Field>
      </div>
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Creating..." : "Create upcoming show wiki"}
      </Button>
    </form>
  );
}
