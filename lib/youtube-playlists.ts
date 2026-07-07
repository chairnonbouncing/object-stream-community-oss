import { youtubeThumbnailUrl } from "@/lib/video-url";
import { parseYouTubeDuration } from "@/lib/duration";

const PLAYLIST_ID = /^[A-Za-z0-9_-]{8,150}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export type ParsedPlaylistUrl =
  | { ok: true; playlistId: string; canonicalUrl: string }
  | { ok: false; error: string };

export type YouTubePlaylistVideo = {
  providerVideoId: string;
  originalUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  runtimeSeconds: number | null;
  position: number;
};

export type YouTubePlaylistPreview = {
  playlistId: string;
  title: string;
  description: string | null;
  channelTitle: string | null;
  videos: YouTubePlaylistVideo[];
};

export type YouTubePlaylistResult =
  | { ok: true; playlist: YouTubePlaylistPreview }
  | { ok: false; error: string };

export function parseYouTubePlaylistUrl(raw: string): ParsedPlaylistUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a YouTube playlist link" };
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a valid YouTube playlist link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) YouTube playlist links are supported" };
  }
  if (!YOUTUBE_PLAYLIST_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: "Only YouTube playlist links are supported" };
  }

  const playlistId = url.searchParams.get("list")?.trim() ?? "";
  if (!PLAYLIST_ID.test(playlistId)) {
    return { ok: false, error: "Couldn't find a playlist ID in that link" };
  }
  return {
    ok: true,
    playlistId,
    canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
  };
}

function bestThumbnail(thumbnails: unknown): string | null {
  if (!thumbnails || typeof thumbnails !== "object") return null;
  const record = thumbnails as Record<string, { url?: unknown }>;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = record[key]?.url;
    if (typeof url === "string") return url;
  }
  return null;
}

async function youtubeGet(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      error: "YouTube playlist import needs YOUTUBE_API_KEY set on the server.",
    };
  }
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [name, value] of Object.entries({ ...params, key })) {
    url.searchParams.set(name, value);
  }
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return {
        ok: false as const,
        error:
          res.status === 403
            ? "YouTube refused the API request. Check the API key and quota."
            : "The playlist is unavailable, private, deleted, or temporarily unreachable.",
      };
    }
    return { ok: true as const, data: await res.json() };
  } catch {
    return { ok: false as const, error: "Could not reach YouTube right now." };
  }
}

export async function fetchYouTubePlaylist(
  playlistId: string,
  limit = 100
): Promise<YouTubePlaylistResult> {
  if (!PLAYLIST_ID.test(playlistId)) return { ok: false, error: "Invalid playlist ID" };

  const playlistRes = await youtubeGet("playlists", {
    part: "snippet",
    id: playlistId,
    maxResults: "1",
  });
  if (!playlistRes.ok) return playlistRes;
  const playlistItems = Array.isArray(playlistRes.data.items) ? playlistRes.data.items : [];
  const playlistSnippet = playlistItems[0]?.snippet;
  if (!playlistSnippet) {
    return { ok: false, error: "The playlist is unavailable, private, or deleted." };
  }

  const rawItems: Array<{
    videoId: string;
    position: number;
    playlistPublishedAt: string | null;
  }> = [];
  let pageToken: string | undefined;
  while (rawItems.length < limit) {
    const page = await youtubeGet("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: String(Math.min(50, limit - rawItems.length)),
      ...(pageToken ? { pageToken } : {}),
    });
    if (!page.ok) return page;
    const items = Array.isArray(page.data.items) ? page.data.items : [];
    for (const item of items) {
      const videoId =
        item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId ?? "";
      if (typeof videoId === "string" && YT_ID.test(videoId)) {
        rawItems.push({
          videoId,
          position:
            typeof item?.snippet?.position === "number"
              ? item.snippet.position + 1
              : rawItems.length + 1,
          playlistPublishedAt:
            typeof item?.contentDetails?.videoPublishedAt === "string"
              ? item.contentDetails.videoPublishedAt
              : null,
        });
      }
    }
    pageToken = typeof page.data.nextPageToken === "string" ? page.data.nextPageToken : undefined;
    if (!pageToken || items.length === 0) break;
  }
  if (pageToken) {
    return {
      ok: false,
      error: "This playlist has more than 100 videos. MVP imports are capped at 100.",
    };
  }
  if (rawItems.length === 0) {
    return { ok: false, error: "No public videos were found in that playlist." };
  }

  const details = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < rawItems.length; i += 50) {
    const batch = rawItems.slice(i, i + 50).map((item) => item.videoId);
    const videoRes = await youtubeGet("videos", {
      part: "snippet,contentDetails",
      id: batch.join(","),
      maxResults: "50",
    });
    if (!videoRes.ok) return videoRes;
    const videos = Array.isArray(videoRes.data.items) ? videoRes.data.items : [];
    for (const video of videos) {
      if (typeof video?.id === "string") details.set(video.id, video);
    }
  }

  const videos = rawItems.flatMap((item) => {
    const detail = details.get(item.videoId);
    const snippet = detail?.snippet as Record<string, unknown> | undefined;
    const contentDetails = detail?.contentDetails as Record<string, unknown> | undefined;
    if (!snippet) return [];
    const title = typeof snippet.title === "string" ? snippet.title : "Untitled video";
    if (title === "Private video" || title === "Deleted video") return [];
    const publishedAt =
      typeof snippet.publishedAt === "string" ? snippet.publishedAt : item.playlistPublishedAt;
    return [
      {
        providerVideoId: item.videoId,
        originalUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
        title,
        description: typeof snippet.description === "string" ? snippet.description : null,
        thumbnailUrl: bestThumbnail(snippet.thumbnails) ?? youtubeThumbnailUrl(item.videoId),
        channelTitle:
          typeof snippet.channelTitle === "string" ? snippet.channelTitle : null,
        publishedAt,
        runtimeSeconds: parseYouTubeDuration(contentDetails?.duration),
        position: item.position,
      },
    ];
  });

  if (videos.length === 0) {
    return { ok: false, error: "No importable public videos were found in that playlist." };
  }

  return {
    ok: true,
    playlist: {
      playlistId,
      title:
        typeof playlistSnippet.title === "string" ? playlistSnippet.title : "YouTube playlist",
      description:
        typeof playlistSnippet.description === "string"
          ? playlistSnippet.description
          : null,
      channelTitle:
        typeof playlistSnippet.channelTitle === "string"
          ? playlistSnippet.channelTitle
          : null,
      videos,
    },
  };
}
