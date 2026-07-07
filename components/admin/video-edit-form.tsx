"use client";

import { useActionState } from "react";
import { updateVideo } from "@/actions/videos";
import { AGE_RANGE_TAGS, LANGUAGES, SHOW_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import type { FormState } from "@/lib/types";

export function VideoEditForm({
  video,
}: {
  video: {
    id: string;
    showTitle: string;
    episodeTitle: string | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    description: string | null;
    ageRangeTag: string;
    genreTags: string;
    language: string;
    releaseYear: number | null;
    status: string;
    thumbnailUrl: string | null;
    channelTitle: string | null;
    publishedAt: Date | null;
    runtimeSeconds: number | null;
  };
}) {
  const action = updateVideo.bind(null, video.id);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state?.error} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Show title" htmlFor="showTitle" errors={state?.fieldErrors?.showTitle}>
          <Input id="showTitle" name="showTitle" defaultValue={video.showTitle} required />
        </Field>
        <Field
          label="Episode title"
          htmlFor="episodeTitle"
          errors={state?.fieldErrors?.episodeTitle}
        >
          <Input
            id="episodeTitle"
            name="episodeTitle"
            defaultValue={video.episodeTitle ?? ""}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Field label="Season" htmlFor="seasonNumber" errors={state?.fieldErrors?.seasonNumber}>
          <Input
            id="seasonNumber"
            name="seasonNumber"
            type="number"
            defaultValue={video.seasonNumber ?? ""}
          />
        </Field>
        <Field label="Episode" htmlFor="episodeNumber" errors={state?.fieldErrors?.episodeNumber}>
          <Input
            id="episodeNumber"
            name="episodeNumber"
            type="number"
            defaultValue={video.episodeNumber ?? ""}
          />
        </Field>
        <Field label="Year" htmlFor="releaseYear" errors={state?.fieldErrors?.releaseYear}>
          <Input
            id="releaseYear"
            name="releaseYear"
            type="number"
            defaultValue={video.releaseYear ?? ""}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" errors={state?.fieldErrors?.description}>
        <Textarea
          id="description"
          name="description"
          defaultValue={video.description ?? ""}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Genre tags"
          htmlFor="genreTags"
          hint="comma-separated"
          errors={state?.fieldErrors?.genreTags}
        >
          <Input id="genreTags" name="genreTags" defaultValue={video.genreTags} />
        </Field>
        <Field
          label="Thumbnail URL"
          htmlFor="thumbnailUrl"
          errors={state?.fieldErrors?.thumbnailUrl}
        >
          <Input
            id="thumbnailUrl"
            name="thumbnailUrl"
            defaultValue={video.thumbnailUrl ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Language" htmlFor="language" errors={state?.fieldErrors?.language}>
          <Select id="language" name="language" defaultValue={video.language}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" errors={state?.fieldErrors?.status}>
          <Select id="status" name="status" defaultValue={video.status}>
            {SHOW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Age range" htmlFor="ageRangeTag" errors={state?.fieldErrors?.ageRangeTag}>
          <Select id="ageRangeTag" name="ageRangeTag" defaultValue={video.ageRangeTag}>
            {AGE_RANGE_TAGS.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Channel / creator" htmlFor="channelTitle" errors={state?.fieldErrors?.channelTitle}>
          <Input id="channelTitle" name="channelTitle" defaultValue={video.channelTitle ?? ""} />
        </Field>
        <Field label="Provider publish date" htmlFor="publishedAt" errors={state?.fieldErrors?.publishedAt}>
          <Input
            id="publishedAt"
            name="publishedAt"
            type="date"
            defaultValue={video.publishedAt ? video.publishedAt.toISOString().slice(0, 10) : ""}
          />
        </Field>
      </div>

      <Field
        label="Runtime"
        htmlFor="runtimeSeconds"
        hint="seconds; used only for public estimated hours watched"
        errors={state?.fieldErrors?.runtimeSeconds}
      >
        <Input
          id="runtimeSeconds"
          name="runtimeSeconds"
          type="number"
          min={1}
          max={86400}
          defaultValue={video.runtimeSeconds ?? ""}
        />
      </Field>

      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Saving…" : "Save metadata"}
      </Button>
    </form>
  );
}
