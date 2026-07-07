export const PROVIDERS = ["youtube", "vimeo"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const SHOW_STATUSES = [
  "Ongoing",
  "Completed",
  "Hiatus",
  "Cancelled",
  "One-shot",
  "Upcoming",
] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export const AGE_RANGE_TAGS = [
  "All Ages",
  "7+",
  "10+",
  "13+",
  "16+",
  "18+",
  "Unrated",
  "Unknown",
] as const;
export type AgeRangeTag = (typeof AGE_RANGE_TAGS)[number];

export const WIKI_PAGE_TYPES = [
  "Show",
  "Upcoming Show",
  "Character",
  "Episode",
  "Season",
  "Creator",
  "Team",
  "Location",
  "Object",
  "Lore",
  "Community",
  "Other",
] as const;
export type WikiPageType = (typeof WIKI_PAGE_TYPES)[number];

export const WATCH_STATUSES = [
  "Watching",
  "Completed",
  "Plan to Watch",
  "On Hold",
  "Dropped",
  "Rewatching",
] as const;
export type WatchStatusValue = (typeof WATCH_STATUSES)[number];

export const GENRES = [
  "comedy",
  "adventure",
  "drama",
  "action",
  "mystery",
  "competition",
  "slice-of-life",
  "horror",
  "musical",
  "meta",
] as const;
export type Genre = (typeof GENRES)[number];

export const LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "Indonesian",
  "Other",
] as const;

export const PAGE_SIZE = 24;
