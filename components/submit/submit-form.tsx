"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  fetchVideoInfo,
  getUrlPreview,
  submitVideo,
  type UrlPreview,
} from "@/actions/videos";
import { parseVideoUrl } from "@/lib/video-url";
import { AGE_RANGE_TAGS, GENRES, LANGUAGES, SHOW_STATUSES } from "@/lib/constants";
import { formatRuntime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";

function PreviewCard({
  preview,
  onUseTitle,
}: {
  preview: UrlPreview;
  onUseTitle: (title: string) => void;
}) {
  if (!preview.ok) {
    return (
      <p className="rounded-xl border border-osc-red/40 bg-osc-red/10 px-3.5 py-2.5 text-sm text-osc-red">
        {preview.error}
      </p>
    );
  }
  return (
    <div className="flex gap-3 rounded-2xl border border-osc-green/40 bg-osc-green/5 p-3">
      {preview.thumbnailUrl ? (
        <img
          src={preview.thumbnailUrl}
          alt=""
          className="h-20 w-32 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-2xl">
          🎬
        </div>
      )}
      <div className="min-w-0 space-y-1 text-sm">
        <Badge color={preview.provider === "youtube" ? "red" : "blue"}>
          {preview.provider === "youtube" ? "YouTube" : "Vimeo"}
        </Badge>
        {preview.suggestedTitle ? (
          <p className="truncate font-bold text-cream">
            {preview.suggestedTitle}{" "}
            <button
              type="button"
              onClick={() => onUseTitle(preview.suggestedTitle!)}
              className="ml-1 text-xs font-bold text-osc-blue hover:underline"
            >
              Use as episode title
            </button>
          </p>
        ) : (
          <p className="text-cream/60">Video detected — ID {preview.providerVideoId}</p>
        )}
        {preview.authorName ? (
          <p className="truncate text-cream/60">
            by {preview.authorName} — they keep every view
          </p>
        ) : null}
        {preview.runtimeSeconds ? (
          <p className="text-cream/50">Runtime {formatRuntime(preview.runtimeSeconds)}</p>
        ) : null}
        {preview.setupNote ? <p className="text-osc-star">{preview.setupNote}</p> : null}
        {preview.duplicateVideoId ? (
          <p className="text-osc-star">
            Already in the catalog!{" "}
            <Link
              href={`/watch/${preview.duplicateVideoId}`}
              className="font-bold underline"
            >
              Watch it here
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SubmitForm({ initialUrl }: { initialUrl?: string }) {
  const [state, formAction, pending] = useActionState(submitVideo, undefined);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [runtimeSeconds, setRuntimeSeconds] = useState("");
  const [enriched, setEnriched] = useState<{ url: string; data: UrlPreview } | null>(
    null
  );
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [infoPending, startInfoTransition] = useTransition();

  const trimmed = url.trim();

  useEffect(() => {
    if (!trimmed || !parseVideoUrl(trimmed).ok) return;
    const timer = setTimeout(async () => {
      const result = await getUrlPreview(trimmed);
      setEnriched({ url: trimmed, data: result });
    }, 500);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Instant local parse renders immediately; the oEmbed-enriched version
  // replaces it once the debounced fetch for the *current* URL lands.
  let preview: UrlPreview | null = null;
  if (trimmed) {
    if (enriched?.url === trimmed) {
      preview = enriched.data;
    } else {
      const parsed = parseVideoUrl(trimmed);
      preview = parsed.ok
        ? {
            ok: true,
            provider: parsed.provider,
            providerVideoId: parsed.providerVideoId,
            suggestedTitle: null,
            description: null,
            thumbnailUrl: null,
            authorName: null,
            publishedAt: null,
            runtimeSeconds: null,
          }
        : { ok: false, error: parsed.error };
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state?.error} />
      {state?.duplicateVideoId ? (
        <p className="text-sm text-osc-star">
          <Link href={`/watch/${state.duplicateVideoId}`} className="font-bold underline">
            → Watch the existing copy instead
          </Link>
        </p>
      ) : null}

      <Field label="Video URL" htmlFor="url" errors={state?.fieldErrors?.url}>
        <Input
          id="url"
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…"
          required
          autoFocus
        />
      </Field>
      {preview ? (
        <PreviewCard
          preview={preview}
          onUseTitle={(t) => setEpisodeTitle((cur) => cur || t)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={infoPending || !trimmed || !parseVideoUrl(trimmed).ok}
          onClick={() => {
            startInfoTransition(async () => {
              const result = await fetchVideoInfo(trimmed);
              if (!result.ok) {
                setFetchMessage(result.error);
                return;
              }
              setEnriched({ url: trimmed, data: result });
              setEpisodeTitle((cur) => cur || result.suggestedTitle || "");
              setDescription((cur) => cur || result.description || "");
              setThumbnailUrl((cur) => cur || result.thumbnailUrl || "");
              setChannelTitle((cur) => cur || result.authorName || "");
              setPublishedAt((cur) => cur || result.publishedAt || "");
              setRuntimeSeconds((cur) =>
                cur || (result.runtimeSeconds ? String(result.runtimeSeconds) : "")
              );
              setFetchMessage(result.setupNote ?? "Video info fetched. Edit anything before submitting.");
            });
          }}
        >
          {infoPending ? "Fetching..." : "Fetch video info"}
        </Button>
        {fetchMessage ? <span className="text-xs text-cream/50">{fetchMessage}</span> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Show title"
          htmlFor="showTitle"
          errors={state?.fieldErrors?.showTitle}
        >
          <Input
            id="showTitle"
            name="showTitle"
            placeholder="Battle for Dream Island"
            required
          />
        </Field>
        <Field
          label="Episode title"
          htmlFor="episodeTitle"
          hint="optional"
          errors={state?.fieldErrors?.episodeTitle}
        >
          <Input
            id="episodeTitle"
            name="episodeTitle"
            value={episodeTitle}
            onChange={(e) => setEpisodeTitle(e.target.value)}
            placeholder="Take the Plunge"
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-4">
        <Field
          label="Season"
          htmlFor="seasonNumber"
          hint="opt."
          errors={state?.fieldErrors?.seasonNumber}
        >
          <Input id="seasonNumber" name="seasonNumber" type="number" min={0} max={999} />
        </Field>
        <Field
          label="Episode"
          htmlFor="episodeNumber"
          hint="opt."
          errors={state?.fieldErrors?.episodeNumber}
        >
          <Input
            id="episodeNumber"
            name="episodeNumber"
            type="number"
            min={0}
            max={9999}
          />
        </Field>
        <Field
          label="Year"
          htmlFor="releaseYear"
          hint="opt."
          errors={state?.fieldErrors?.releaseYear}
        >
          <Input
            id="releaseYear"
            name="releaseYear"
            type="number"
            min={1990}
            max={new Date().getFullYear() + 1}
          />
        </Field>
        <Field
          label="Runtime"
          htmlFor="runtimeSeconds"
          hint="seconds, opt."
          errors={state?.fieldErrors?.runtimeSeconds}
        >
          <Input
            id="runtimeSeconds"
            name="runtimeSeconds"
            type="number"
            min={1}
            max={86400}
            value={runtimeSeconds}
            onChange={(e) => setRuntimeSeconds(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor="description"
        hint="optional"
        errors={state?.fieldErrors?.description}
      >
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happens in this episode?"
          />
        </Field>

      <Field label="Genres" hint="pick up to 5" errors={state?.fieldErrors?.genres}>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <label
              key={g}
              className="cursor-pointer select-none rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-cream/70 transition has-checked:border-osc-purple has-checked:bg-osc-purple/25 has-checked:text-cream"
            >
              <input type="checkbox" name="genres" value={g} className="sr-only" />
              {g}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Language" htmlFor="language" errors={state?.fieldErrors?.language}>
          <Select id="language" name="language" defaultValue="English">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Show status" htmlFor="status" errors={state?.fieldErrors?.status}>
          <Select id="status" name="status" defaultValue="Ongoing">
            {SHOW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Age range" htmlFor="ageRangeTag" errors={state?.fieldErrors?.ageRangeTag}>
        <Select id="ageRangeTag" name="ageRangeTag" defaultValue="Unknown">
          {AGE_RANGE_TAGS.map((age) => (
            <option key={age} value={age}>
              {age}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Extra tags"
          htmlFor="extraTags"
          hint="comma-separated, optional"
          errors={state?.fieldErrors?.extraTags}
        >
          <Input id="extraTags" name="extraTags" placeholder="fan-favorite, s1" />
        </Field>
        <Field
          label="Thumbnail URL"
          htmlFor="thumbnailUrl"
          hint="optional override"
          errors={state?.fieldErrors?.thumbnailUrl}
        >
          <Input
            id="thumbnailUrl"
            name="thumbnailUrl"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </div>
      <input type="hidden" name="channelTitle" value={channelTitle} />
      <input type="hidden" name="publishedAt" value={publishedAt} />

      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Add to the catalog"}
      </Button>
    </form>
  );
}
