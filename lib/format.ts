export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatHoursFromSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 hours";
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} min`;
  return `${hours.toFixed(hours >= 10 ? 0 : 1).replace(/\.0$/, "")} hours`;
}

export function formatRuntime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Runtime unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function splitTags(csv: string): string[] {
  return csv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinTags(tags: string[]): string {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].join(",");
}

export function episodeLabel(v: { seasonNumber: number | null; episodeNumber: number | null }): string | null {
  if (v.seasonNumber != null && v.episodeNumber != null)
    return `S${v.seasonNumber} · E${v.episodeNumber}`;
  if (v.episodeNumber != null) return `Episode ${v.episodeNumber}`;
  if (v.seasonNumber != null) return `Season ${v.seasonNumber}`;
  return null;
}
