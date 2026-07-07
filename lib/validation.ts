import { z } from "zod";
import {
  AGE_RANGE_TAGS,
  GENRES,
  LANGUAGES,
  SHOW_STATUSES,
  WATCH_STATUSES,
  WIKI_PAGE_TYPES,
} from "@/lib/constants";

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3–20 characters: letters, numbers, underscores");

export const signupSchema = z
  .object({
    username: usernameSchema,
    email: z.preprocess(emptyToUndef, z.email("Enter a valid email").optional()),
    password: z.string().min(8, "At least 8 characters").max(100),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export const signinSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const CURRENT_YEAR = new Date().getFullYear();

export const submitVideoSchema = z.object({
  url: z.string().trim().min(1, "Paste a YouTube or Vimeo link"),
  showTitle: z.string().trim().min(1, "Required").max(120, "Max 120 characters"),
  episodeTitle: z.preprocess(emptyToUndef, z.string().trim().max(160).optional()),
  seasonNumber: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional()
  ),
  episodeNumber: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(9999).optional()
  ),
  description: z.preprocess(emptyToUndef, z.string().trim().max(12000).optional()),
  ageRangeTag: z.enum(AGE_RANGE_TAGS).default("Unknown"),
  genres: z.array(z.enum(GENRES)).max(5, "Pick at most 5 genres").default([]),
  extraTags: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  language: z.enum(LANGUAGES),
  releaseYear: z.preprocess(
    emptyToUndef,
    z.coerce
      .number()
      .int()
      .min(1990, "Object shows start around 2008 — year looks too old")
      .max(CURRENT_YEAR + 1)
      .optional()
  ),
  status: z.enum(SHOW_STATUSES),
  thumbnailUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  channelTitle: z.preprocess(emptyToUndef, z.string().trim().max(160).optional()),
  publishedAt: z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  runtimeSeconds: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(24 * 60 * 60).optional()
  ),
});

/** Metadata edit (community wiki-style) — same fields as submit minus the URL
 *  (embed data is immutable; delete and resubmit if the link itself is wrong). */
export const videoEditSchema = z.object({
  showTitle: z.string().trim().min(1, "Required").max(120),
  episodeTitle: z.preprocess(emptyToUndef, z.string().trim().max(160).optional()),
  seasonNumber: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional()
  ),
  episodeNumber: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(9999).optional()
  ),
  description: z.preprocess(emptyToUndef, z.string().trim().max(12000).optional()),
  ageRangeTag: z.enum(AGE_RANGE_TAGS).default("Unknown"),
  genreTags: z.string().trim().max(200).default(""),
  language: z.enum(LANGUAGES),
  releaseYear: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1990).max(CURRENT_YEAR + 1).optional()
  ),
  status: z.enum(SHOW_STATUSES),
  thumbnailUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  channelTitle: z.preprocess(emptyToUndef, z.string().trim().max(160).optional()),
  publishedAt: z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  runtimeSeconds: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(24 * 60 * 60).optional()
  ),
});

export const reviewSchema = z.object({
  text: z.string().trim().min(3, "Say a little more").max(2000),
  rating: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).max(5).optional()
  ),
});

export const ratingSchema = z.number().int().min(1).max(5);

export const watchStatusSchema = z.enum(WATCH_STATUSES);

export const playlistSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  description: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  isPublic: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export const profileSchema = z.object({
  avatarUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  bio: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
});

export const reportSchema = z.object({
  reason: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
});

export const youtubePlaylistImportSchema = z.object({
  playlistUrl: z.string().trim().min(1, "Paste a YouTube playlist link").max(500),
  showTitle: z.string().trim().min(1, "Required").max(120),
  seasonNumber: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(0).max(999).optional()
  ),
  status: z.enum(SHOW_STATUSES).default("Ongoing"),
  genres: z.array(z.enum(GENRES)).max(5, "Pick at most 5 genres").default([]),
  extraTags: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  language: z.enum(LANGUAGES).default("English"),
  releaseYear: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1990).max(CURRENT_YEAR + 1).optional()
  ),
  ageRangeTag: z.enum(AGE_RANGE_TAGS).default("Unknown"),
});

export const wikiPageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  pageType: z.enum(WIKI_PAGE_TYPES).default("Other"),
  relatedShowId: z.preprocess(emptyToUndef, z.string().trim().optional()),
  relatedVideoId: z.preprocess(emptyToUndef, z.string().trim().optional()),
  mainImageUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  categories: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  contentWikitext: z.string().trim().max(80000).default(""),
  editSummary: z.preprocess(emptyToUndef, z.string().trim().max(180).optional()),
});

export const wikiDiscussionSchema = z.object({
  text: z.string().trim().min(1, "Write a comment").max(3000),
});

export const upcomingShowSchema = z.object({
  title: z.string().trim().min(1, "Required").max(120),
  description: z.preprocess(emptyToUndef, z.string().trim().max(3000).optional()),
  creatorName: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  expectedReleaseDate: z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  ageRangeTag: z.enum(AGE_RANGE_TAGS).default("Unknown"),
  language: z.enum(LANGUAGES).default("English"),
  genres: z.array(z.enum(GENRES)).max(5).default([]),
  extraTags: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  trailerUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  coverImageUrl: z.preprocess(emptyToUndef, z.url("Must be a valid URL").optional()),
  sourceLinks: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
});
