import { fetchOEmbed } from "@/lib/oembed";
import { normalizeRuntimeSeconds, parseYouTubeDuration } from "@/lib/duration";
import { parseVideoUrl, youtubeThumbnailUrl, type VideoProvider } from "@/lib/video-url";

export type ProviderVideoInfo = {
  provider: VideoProvider;
  providerVideoId: string;
  originalUrl: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  runtimeSeconds: number | null;
  setupNote?: string;
};

async function fetchYouTubeVideoInfo(id: string, originalUrl: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    const oembed = await fetchOEmbed("youtube", originalUrl);
    return {
      provider: "youtube" as const,
      providerVideoId: id,
      originalUrl,
      title: oembed?.title ?? null,
      description: null,
      thumbnailUrl: oembed?.thumbnailUrl ?? youtubeThumbnailUrl(id),
      channelTitle: oembed?.authorName ?? null,
      publishedAt: null,
      runtimeSeconds: normalizeRuntimeSeconds(oembed?.runtimeSeconds),
      setupNote:
        "Set YOUTUBE_API_KEY to fetch YouTube descriptions and publish dates.",
    };
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", id);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("youtube failed");
    const data: unknown = await res.json();
    const item = Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: Array<Record<string, unknown>> }).items[0]
      : null;
    const snippet = item?.snippet as Record<string, unknown> | undefined;
    const contentDetails = item?.contentDetails as Record<string, unknown> | undefined;
    if (!snippet) throw new Error("no video");
    return {
      provider: "youtube" as const,
      providerVideoId: id,
      originalUrl,
      title: typeof snippet.title === "string" ? snippet.title : null,
      description: typeof snippet.description === "string" ? snippet.description : null,
      thumbnailUrl:
        typeof (snippet.thumbnails as Record<string, { url?: unknown }> | undefined)?.high
          ?.url === "string"
          ? String(
              (snippet.thumbnails as Record<string, { url?: unknown }>).high.url
            )
          : youtubeThumbnailUrl(id),
      channelTitle:
        typeof snippet.channelTitle === "string" ? snippet.channelTitle : null,
      publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
      runtimeSeconds: parseYouTubeDuration(contentDetails?.duration),
    };
  } catch {
    const oembed = await fetchOEmbed("youtube", originalUrl);
    return {
      provider: "youtube" as const,
      providerVideoId: id,
      originalUrl,
      title: oembed?.title ?? null,
      description: null,
      thumbnailUrl: oembed?.thumbnailUrl ?? youtubeThumbnailUrl(id),
      channelTitle: oembed?.authorName ?? null,
      publishedAt: null,
      runtimeSeconds: normalizeRuntimeSeconds(oembed?.runtimeSeconds),
      setupNote: "YouTube metadata could not be fully fetched right now.",
    };
  }
}

async function fetchVimeoVideoInfo(id: string, originalUrl: string) {
  const oembed = await fetchOEmbed("vimeo", originalUrl);
  return {
    provider: "vimeo" as const,
    providerVideoId: id,
    originalUrl,
    title: oembed?.title ?? null,
    description: null,
    thumbnailUrl: oembed?.thumbnailUrl ?? null,
    channelTitle: oembed?.authorName ?? null,
    publishedAt: null,
    runtimeSeconds: normalizeRuntimeSeconds(oembed?.runtimeSeconds),
    setupNote: oembed ? undefined : "Vimeo metadata could not be fetched right now.",
  };
}

export async function fetchProviderVideoInfo(
  rawUrl: string
): Promise<{ ok: true; info: ProviderVideoInfo } | { ok: false; error: string }> {
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const info =
    parsed.provider === "youtube"
      ? await fetchYouTubeVideoInfo(parsed.providerVideoId, parsed.canonicalUrl)
      : await fetchVimeoVideoInfo(parsed.providerVideoId, parsed.canonicalUrl);
  return { ok: true, info };
}
