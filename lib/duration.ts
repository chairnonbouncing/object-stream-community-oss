export function parseYouTubeDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const total =
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds);
  return total > 0 ? total : null;
}

export function normalizeRuntimeSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return normalizeRuntimeSeconds(Number(trimmed));
  return parseYouTubeDuration(trimmed);
}
