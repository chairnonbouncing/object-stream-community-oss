import type { VideoProvider } from "@/lib/video-url";

export type OEmbedData = {
  title: string | null;
  thumbnailUrl: string | null;
  authorName: string | null;
  runtimeSeconds: number | null;
};

/**
 * Fetches video metadata from the providers' official oEmbed APIs.
 * Best-effort: any failure (network, 404, private video) returns null.
 */
export async function fetchOEmbed(
  provider: VideoProvider,
  url: string
): Promise<OEmbedData | null> {
  const endpoint =
    provider === "youtube"
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    return {
      title: typeof record.title === "string" ? record.title : null,
      thumbnailUrl:
        typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
      authorName: typeof record.author_name === "string" ? record.author_name : null,
      runtimeSeconds:
        typeof record.duration === "number" && Number.isFinite(record.duration)
          ? Math.round(record.duration)
          : null,
    };
  } catch {
    return null;
  }
}
