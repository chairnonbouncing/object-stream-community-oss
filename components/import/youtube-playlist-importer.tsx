"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importYoutubePlaylist, type ImportState } from "@/actions/imports";
import { AGE_RANGE_TAGS, GENRES, LANGUAGES, SHOW_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Input, Select } from "@/components/ui/field";

export function YouTubePlaylistImporter({ isAdmin }: { isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    importYoutubePlaylist,
    undefined
  );
  const preview = state?.preview;
  // React 19 resets uncontrolled inputs after every action — these
  // defaultValues (echoed back by the action) put the values right back,
  // so the form stays filled between "preview" and "confirm".
  const saved = state?.form;

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state?.error} />

      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <Field
            label="YouTube playlist URL"
            htmlFor="playlistUrl"
            errors={state?.fieldErrors?.playlistUrl}
          >
            <Input
              id="playlistUrl"
              name="playlistUrl"
              defaultValue={saved?.playlistUrl ?? ""}
              placeholder="https://www.youtube.com/playlist?list=..."
              required
            />
          </Field>
          <Field
            label="Show title"
            htmlFor="showTitle"
            errors={state?.fieldErrors?.showTitle}
          >
            <Input
              id="showTitle"
              name="showTitle"
              defaultValue={saved?.showTitle ?? ""}
              placeholder="Battle for Dream Island"
              required
            />
          </Field>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Season" htmlFor="seasonNumber" hint="optional">
            <Input
              id="seasonNumber"
              name="seasonNumber"
              type="number"
              min={0}
              max={999}
              defaultValue={saved?.seasonNumber ?? ""}
            />
          </Field>
          <Field label="Show status" htmlFor="status">
            <Select id="status" name="status" defaultValue={saved?.status || "Ongoing"}>
              {SHOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="language">
            <Select id="language" name="language" defaultValue={saved?.language || "English"}>
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Age range" htmlFor="ageRangeTag">
            <Select id="ageRangeTag" name="ageRangeTag" defaultValue={saved?.ageRangeTag || "Unknown"}>
              {AGE_RANGE_TAGS.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Release year" htmlFor="releaseYear" hint="optional">
            <Input
              id="releaseYear"
              name="releaseYear"
              type="number"
              min={1990}
              defaultValue={saved?.releaseYear ?? ""}
            />
          </Field>
          <Field label="Extra tags" htmlFor="extraTags" hint="comma-separated, optional">
            <Input
              id="extraTags"
              name="extraTags"
              defaultValue={saved?.extraTags ?? ""}
              placeholder="season-1, fan-favorite"
            />
          </Field>
        </div>

        <Field label="Genres" hint="pick up to 5" className="mt-5">
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <label
                key={genre}
                className="cursor-pointer select-none rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-cream/70 transition has-checked:border-osc-purple has-checked:bg-osc-purple/25 has-checked:text-cream"
              >
                <input
                  type="checkbox"
                  name="genres"
                  value={genre}
                  defaultChecked={saved?.genres?.includes(genre) ?? false}
                  className="sr-only"
                />
                {genre}
              </label>
            ))}
          </div>
        </Field>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button name="intent" value="preview" variant="accent" disabled={pending}>
            {pending ? "Checking..." : "Import preview"}
          </Button>
          {preview ? (
            <Button name="intent" value="confirm" variant="primary" disabled={pending}>
              {pending ? "Importing..." : "Confirm import"}
            </Button>
          ) : null}
        </div>
      </div>

      {preview ? (
        <section className="space-y-4">
          <div className="rounded-3xl border border-osc-blue/30 bg-osc-blue/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-cream">{preview.title}</h2>
                <p className="text-sm text-cream/60">
                  {preview.channelTitle ? `${preview.channelTitle} · ` : ""}
                  {preview.videos.length} video{preview.videos.length === 1 ? "" : "s"} found
                </p>
              </div>
              <Badge color="red">YouTube</Badge>
            </div>
            {preview.description ? (
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-cream/60">
                {preview.description}
              </p>
            ) : null}
          </div>

          <ul className="space-y-3">
            {preview.videos.map((video) => (
              <li
                key={video.providerVideoId}
                className="grid gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)]"
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-video w-full rounded-xl object-cover sm:w-40"
                  />
                ) : null}
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-cream">
                      <input
                        type="checkbox"
                        name="selectedVideoIds"
                        value={video.providerVideoId}
                        defaultChecked={!video.duplicateVideoId}
                        className="h-4 w-4 accent-osc-purple"
                      />
                      #{video.position}
                    </label>
                    {video.duplicateVideoId ? (
                      <Badge color="yellow">Already added</Badge>
                    ) : (
                      <Badge color="green">New</Badge>
                    )}
                    {isAdmin && video.duplicateVideoId ? (
                      <label className="inline-flex items-center gap-1 text-xs font-bold text-cream/50">
                        <input
                          type="checkbox"
                          name="updateMetadataIds"
                          value={video.providerVideoId}
                          className="h-3.5 w-3.5 accent-osc-star"
                        />
                        update metadata
                      </label>
                    ) : null}
                  </div>
                  <h3 className="truncate font-bold text-cream" title={video.title}>
                    {video.title}
                  </h3>
                  <p className="text-xs text-cream/50">
                    {video.channelTitle ?? "Unknown channel"}
                    {video.publishedAt ? ` · ${new Date(video.publishedAt).toLocaleDateString()}` : ""}
                    {video.duplicateVideoId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/watch/${video.duplicateVideoId}`}
                          className="font-bold text-osc-blue hover:underline"
                        >
                          existing catalog page
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {video.description ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm text-cream/60">
                      {video.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
