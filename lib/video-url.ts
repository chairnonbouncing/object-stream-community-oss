import type { Provider } from "@/lib/constants";

export type VideoProvider = Provider;

export type ParsedVideoUrl =
  | {
      ok: true;
      provider: VideoProvider;
      providerVideoId: string;
      canonicalUrl: string;
      vimeoHash?: string;
    }
  | { ok: false; error: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[a-zA-Z0-9]{6,12}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);

function ytResult(id: string): ParsedVideoUrl {
  if (!YT_ID.test(id)) {
    return { ok: false, error: "Couldn't find a video ID in that YouTube link" };
  }
  return {
    ok: true,
    provider: "youtube",
    providerVideoId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

function vimeoResult(id: string, hash?: string): ParsedVideoUrl {
  if (!VIMEO_ID.test(id)) {
    return { ok: false, error: "Couldn't find a video ID in that Vimeo link" };
  }
  const vimeoHash = hash && VIMEO_HASH.test(hash) ? hash : undefined;
  return {
    ok: true,
    provider: "vimeo",
    providerVideoId: id,
    canonicalUrl: `https://vimeo.com/${id}${vimeoHash ? `/${vimeoHash}` : ""}`,
    ...(vimeoHash ? { vimeoHash } : {}),
  };
}

/**
 * Detects YouTube/Vimeo links and extracts the video ID. Only safe embed data
 * is ever stored — never raw iframes and never links from other hosts.
 */
export function parseVideoUrl(raw: string): ParsedVideoUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a YouTube or Vimeo link" };

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) links are supported" };
  }

  const host = url.hostname.toLowerCase();
  const segs = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return ytResult(segs[0] ?? "");
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (segs[0] === "watch") return ytResult(url.searchParams.get("v") ?? "");
    const [first, second] = segs;
    if (
      (first === "embed" || first === "shorts" || first === "live" || first === "v") &&
      second
    ) {
      return ytResult(second);
    }
    return {
      ok: false,
      error: "That YouTube link isn't a single video — paste a watch, share, or embed link",
    };
  }

  if (host === "player.vimeo.com") {
    if (segs[0] === "video" && segs[1]) {
      return vimeoResult(segs[1], url.searchParams.get("h") ?? undefined);
    }
    return { ok: false, error: "That Vimeo player link isn't a single video" };
  }

  if (VIMEO_HOSTS.has(host)) {
    if (segs[0] && VIMEO_ID.test(segs[0])) return vimeoResult(segs[0], segs[1]);
    if (segs[0] === "channels" && segs[2]) return vimeoResult(segs[2]);
    if (segs[0] === "groups" && segs[2] === "videos" && segs[3]) {
      return vimeoResult(segs[3]);
    }
    return {
      ok: false,
      error: "That Vimeo link isn't a single video — paste a link like vimeo.com/123456789",
    };
  }

  return { ok: false, error: "Only YouTube and Vimeo links are supported" };
}

/** Official players only: privacy-enhanced YouTube, do-not-track Vimeo.
 *  `hideControls` uses the providers' own documented parameters — used in
 *  theater mode where our overlay drives playback through the JS API. */
export function buildEmbedUrl(
  provider: VideoProvider,
  id: string,
  opts: {
    autoplay?: boolean;
    jsApi?: boolean;
    origin?: string;
    vimeoHash?: string;
    hideControls?: boolean;
    captions?: boolean;
  } = {}
): string {
  if (provider === "youtube") {
    const params = new URLSearchParams({ rel: "0" });
    if (opts.jsApi) {
      params.set("enablejsapi", "1");
      if (opts.origin) params.set("origin", opts.origin);
    }
    if (opts.autoplay) {
      params.set("autoplay", "1");
      params.set("playsinline", "1");
    }
    if (opts.hideControls) {
      params.set("controls", "0");
      params.set("iv_load_policy", "3");
    }
    if (opts.captions) params.set("cc_load_policy", "1");
    return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
  }
  const params = new URLSearchParams({ dnt: "1" });
  if (opts.jsApi) {
    params.set("api", "1");
    params.set("player_id", "osc-player");
  }
  if (opts.vimeoHash) params.set("h", opts.vimeoHash);
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.hideControls) {
    params.set("title", "0");
    params.set("byline", "0");
    params.set("portrait", "0");
  }
  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export const PLACEHOLDER_THUMB = "/images/placeholder-thumb.svg";

export function resolveThumbnail(video: {
  provider: string;
  providerVideoId: string;
  thumbnailUrl: string | null;
}): string {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  if (video.provider === "youtube") return youtubeThumbnailUrl(video.providerVideoId);
  return PLACEHOLDER_THUMB;
}

/** Unlisted-Vimeo hash isn't stored — recover it from the submitted URL. */
export function getVimeoHash(originalUrl: string): string | undefined {
  const parsed = parseVideoUrl(originalUrl);
  return parsed.ok && parsed.provider === "vimeo" ? parsed.vimeoHash : undefined;
}
