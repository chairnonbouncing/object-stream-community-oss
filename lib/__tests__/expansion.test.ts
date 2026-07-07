import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGE_RANGE_TAGS } from "@/lib/constants";
import { isPlaylistSort } from "@/lib/queries/playlists";
import { isShowSort } from "@/lib/queries/shows";
import {
  buildVideoWhere,
  isDiscoverRuntime,
  isDiscoverSort,
} from "@/lib/queries/videos";
import { parseYouTubeDuration, normalizeRuntimeSeconds } from "@/lib/duration";
import { formatHoursFromSeconds, formatRuntime } from "@/lib/format";
import {
  publicViewCookieName,
  publicViewStorageKey,
} from "@/lib/public-view";
import { safeExternalImageUrl } from "@/lib/safe-url";
import { renderPlainTextWithLinks } from "@/lib/text-rendering";
import {
  parseVimeoVideoInput,
  parseWikitextToVisualDocument,
  parseYouTubeVideoInput,
  visualDocumentToWikitext,
  type VisualWikiDocument,
} from "@/lib/wiki-visual";
import { renderWikitext } from "@/lib/wiki-renderer";
import {
  fetchYouTubePlaylist,
  parseYouTubePlaylistUrl,
} from "@/lib/youtube-playlists";

const originalKey = process.env.YOUTUBE_API_KEY;

afterEach(() => {
  process.env.YOUTUBE_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("age range tags", () => {
  it("contains the required informational options", () => {
    expect(AGE_RANGE_TAGS).toEqual([
      "All Ages",
      "7+",
      "10+",
      "13+",
      "16+",
      "18+",
      "Unrated",
      "Unknown",
    ]);
  });
});

describe("parseYouTubePlaylistUrl", () => {
  it("extracts playlist IDs from the supported URL shapes", () => {
    const expected = expect.objectContaining({ ok: true, playlistId: "PLabcdefghi12345" });
    expect(parseYouTubePlaylistUrl("https://youtube.com/playlist?list=PLabcdefghi12345")).toEqual(expected);
    expect(parseYouTubePlaylistUrl("https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghi12345")).toEqual(expected);
    expect(parseYouTubePlaylistUrl("https://music.youtube.com/playlist?list=PLabcdefghi12345")).toEqual(expected);
    expect(parseYouTubePlaylistUrl("https://youtu.be/dQw4w9WgXcQ?list=PLabcdefghi12345")).toEqual(expected);
  });

  it("rejects non-YouTube and missing-list inputs", () => {
    expect(parseYouTubePlaylistUrl("https://example.com/playlist?list=PLabcdefghi12345").ok).toBe(false);
    expect(parseYouTubePlaylistUrl("https://youtube.com/watch?v=dQw4w9WgXcQ").ok).toBe(false);
    expect(parseYouTubePlaylistUrl("javascript:alert(1)").ok).toBe(false);
  });
});

describe("safe external image URLs", () => {
  it("allows http(s) image URLs and trusted provider thumbnails", () => {
    expect(safeExternalImageUrl("https://example.com/render.webp")).toBe("https://example.com/render.webp");
    expect(safeExternalImageUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")).toContain("i.ytimg.com");
  });

  it("blocks unsafe or non-image sources", () => {
    expect(safeExternalImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalImageUrl("data:image/png;base64,abc")).toBeNull();
    expect(safeExternalImageUrl("file:///tmp/image.png")).toBeNull();
    expect(safeExternalImageUrl("https://example.com/page.html")).toBeNull();
  });
});

describe("runtime metadata", () => {
  it("parses YouTube ISO-8601 durations for public watched-hour estimates", () => {
    expect(parseYouTubeDuration("PT1H2M3S")).toBe(3723);
    expect(parseYouTubeDuration("PT47S")).toBe(47);
    expect(parseYouTubeDuration("P1DT2H")).toBe(93600);
    expect(parseYouTubeDuration("PT0S")).toBeNull();
    expect(parseYouTubeDuration("not a duration")).toBeNull();
  });

  it("normalizes provider runtime values and formats public totals", () => {
    expect(normalizeRuntimeSeconds("PT2M")).toBe(120);
    expect(normalizeRuntimeSeconds("91")).toBe(91);
    expect(normalizeRuntimeSeconds(91.2)).toBe(91);
    expect(normalizeRuntimeSeconds(0)).toBeNull();
    expect(formatHoursFromSeconds(1800)).toBe("30 min");
    expect(formatHoursFromSeconds(5400)).toBe("1.5 hours");
    expect(formatRuntime(75)).toBe("1:15");
    expect(formatRuntime(3661)).toBe("1:01:01");
  });
});

describe("public discovery filters", () => {
  it("validates public browse URL sort and runtime options", () => {
    expect(isDiscoverSort("watched")).toBe(true);
    expect(isDiscoverSort("runtime")).toBe(true);
    expect(isDiscoverSort("private-score")).toBe(false);
    expect(isDiscoverRuntime("short")).toBe(true);
    expect(isDiscoverRuntime("unknown")).toBe(true);
    expect(isDiscoverRuntime("tracked-session")).toBe(false);
    expect(isShowSort("followers")).toBe(true);
    expect(isShowSort("private")).toBe(false);
    expect(isPlaylistSort("videos")).toBe(true);
    expect(isPlaylistSort("owner")).toBe(false);
  });

  it("builds runtime bucket filters from public video metadata only", () => {
    expect(buildVideoWhere({ runtime: "short" })).toMatchObject({
      isHidden: false,
      runtimeSeconds: { lte: 600 },
    });
    expect(buildVideoWhere({ runtime: "standard" })).toMatchObject({
      runtimeSeconds: { gt: 600, lte: 1200 },
    });
    expect(buildVideoWhere({ runtime: "long" })).toMatchObject({
      runtimeSeconds: { gt: 1200 },
    });
    expect(buildVideoWhere({ runtime: "unknown" })).toMatchObject({
      runtimeSeconds: null,
    });
  });
});

describe("public view cooldown tokens", () => {
  it("uses short public object tokens rather than raw arbitrary identifiers", () => {
    const raw = "someone@example.com/path?x=1";
    expect(publicViewCookieName("video", raw)).toBe("osc_v_video_someone_example_com_path_x_1");
    expect(publicViewStorageKey("video", raw)).toBe(
      "osc-public-view:video:someone_example_com_path_x_1"
    );
    expect(publicViewCookieName("wiki", "safe_public_id")).toBe(
      "osc_v_wiki_safe_public_id"
    );
  });
});

describe("description rendering", () => {
  it("linkifies URLs while escaping markup and preserving line breaks", () => {
    const html = renderPlainTextWithLinks("Watch https://example.com\n<script>x</script>");
    expect(html).toContain('<a href="https://example.com/"');
    expect(html).toContain("<br />");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("wikitext rendering", () => {
  it("renders supported wiki syntax safely", () => {
    const rendered = renderWikitext(`{{Stub}}
== Characters ==
'''Bold''' and ''italic''
[[Firey|Firey from BFDI]]
[https://example.com Official site]
[[Image:https://example.com/firey.png|thumb|Firey render]]
[[YouTube:dQw4w9WgXcQ]]
[[Category:BFDI]]
<script>alert(1)</script>`);

    expect(rendered.html).toContain("<h2");
    expect(rendered.html).toContain("<strong>Bold</strong>");
    expect(rendered.html).toContain("/wiki/firey");
    expect(rendered.html).toContain("wiki-image");
    expect(rendered.html).toContain("youtube-nocookie.com");
    expect(rendered.categories).toEqual(["BFDI"]);
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("blocks unsafe image and unsupported iframe input", () => {
    const rendered = renderWikitext(`[[Image:data:image/png;base64,abc|thumb|bad]]
<iframe src="https://evil.example"></iframe>`);
    expect(rendered.html).toContain("Image blocked");
    expect(rendered.html).not.toContain("<iframe src=\"https://evil.example\"");
    expect(rendered.html).toContain("&lt;iframe");
  });

  it("renders references, cleanup templates, navboxes, quotes, and tables safely", () => {
    const rendered = renderWikitext(`{{Needs cleanup}}
> Production note
Paragraph<ref>[https://example.com Source]</ref>
{{References}}
{{Navbox show
| title = Example Show
| links = Characters, Episodes|Episode list
}}
{| class="wikitable"
! Character !! Role
|-
| Firey || Contestant
|}`);

    expect(rendered.html).toContain("This page needs cleanup.");
    expect(rendered.html).toContain("wiki-quote");
    expect(rendered.html).toContain("wiki-references");
    expect(rendered.html).toContain("wiki-navbox");
    expect(rendered.html).toContain("<th>Character</th>");
    expect(rendered.html).toContain("/wiki/characters");
  });
});

describe("visual wiki conversion", () => {
  it("serializes every supported visual block to safe canonical wikitext", () => {
    const document: VisualWikiDocument = {
      categories: ["Shows", "Characters", "Shows"],
      blocks: [
        { type: "template", kind: "Stub" },
        { type: "heading", level: 2, text: "Characters" },
        { type: "paragraph", text: "'''Bold''' and ''italic'' text" },
        { type: "bulletList", items: ["Firey", "Leafy"] },
        { type: "numberedList", items: ["First", "Second"] },
        { type: "quote", text: "A cited production note" },
        { type: "internalLink", target: "Firey", label: "Firey from BFDI" },
        { type: "externalLink", url: "https://example.com", label: "Official site" },
        {
          type: "imageEmbed",
          url: "https://example.com/firey.png",
          style: "thumb",
          caption: "Firey render",
        },
        { type: "youtubeEmbed", videoId: "https://youtu.be/dQw4w9WgXcQ" },
        { type: "vimeoEmbed", videoId: "https://vimeo.com/123456789" },
        {
          type: "infobox",
          infoboxType: "show",
          fields: { title: "Example Show", status: "Ongoing", image: "" },
        },
        { type: "table", headerRow: true, rows: [["Character", "Role"], ["Firey", "Contestant"]] },
        { type: "reference", text: "Production post", url: "https://example.com/post", title: "Source" },
        { type: "referencesList" },
        { type: "navbox", title: "Example Show", links: [{ target: "Characters" }] },
        { type: "raw", wikitext: "{{Advanced|kept=yes}}" },
      ],
    };

    const wikitext = visualDocumentToWikitext(document);
    expect(wikitext).toContain("{{Stub}}");
    expect(wikitext).toContain("== Characters ==");
    expect(wikitext).toContain("* Firey");
    expect(wikitext).toContain("# First");
    expect(wikitext).toContain("> A cited production note");
    expect(wikitext).toContain("[[Firey|Firey from BFDI]]");
    expect(wikitext).toContain("[https://example.com/ Official site]");
    expect(wikitext).toContain("[[Image:https://example.com/firey.png|thumb|Firey render]]");
    expect(wikitext).toContain("[[YouTube:dQw4w9WgXcQ]]");
    expect(wikitext).toContain("[[Vimeo:123456789]]");
    expect(wikitext).toContain("{{Infobox show");
    expect(wikitext).toContain('{| class="wikitable"');
    expect(wikitext).toContain("<ref>[https://example.com/post Source] - Production post</ref>");
    expect(wikitext).toContain("{{References}}");
    expect(wikitext).toContain("{{Navbox show");
    expect(wikitext).toContain("{{Advanced|kept=yes}}");
    expect(wikitext.match(/\[\[Category:Shows\]\]/g)).toHaveLength(1);
  });

  it("parses supported wikitext while preserving advanced syntax as raw blocks", () => {
    const document = parseWikitextToVisualDocument(`{{Spoilers}}
== Summary ==
Object show page.
[[Image:https://example.com/show.webp|full|Poster]]
[[YouTube:dQw4w9WgXcQ]]
{| class="wikitable"
! Name
|-
| Firey
|}
<custom-widget unsafe="no"></custom-widget>
[[Category:Shows]]`);

    expect(document.categories).toEqual(["Shows"]);
    expect(document.blocks.some((block) => block.type === "template" && block.kind === "Spoilers")).toBe(true);
    expect(document.blocks.some((block) => block.type === "heading" && block.text === "Summary")).toBe(true);
    expect(document.blocks.some((block) => block.type === "imageEmbed" && block.style === "full")).toBe(true);
    expect(document.blocks.some((block) => block.type === "youtubeEmbed")).toBe(true);
    expect(document.blocks.some((block) => block.type === "table")).toBe(true);
    expect(document.blocks.some((block) => block.type === "raw")).toBe(true);
  });

  it("rejects unsafe visual media and external links during conversion", () => {
    const wikitext = visualDocumentToWikitext({
      categories: [],
      blocks: [
        { type: "externalLink", url: "javascript:alert(1)", label: "bad" },
        { type: "imageEmbed", url: "data:image/png;base64,abc", style: "thumb" },
        { type: "youtubeEmbed", videoId: "not-valid" },
        { type: "vimeoEmbed", videoId: "https://example.com/video" },
      ],
    });
    expect(wikitext).toBe("");
    expect(parseYouTubeVideoInput("youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVimeoVideoInput("player.vimeo.com/video/123456789")).toBe("123456789");
  });
});

describe("fetchYouTubePlaylist", () => {
  it("returns a setup error when the API key is missing", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const result = await fetchYouTubePlaylist("PLabcdefghi12345");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("YOUTUBE_API_KEY");
  });

  it("rejects playlists over the MVP import limit", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const ids = Array.from({ length: 50 }, (_, i) => `abcde${String(i).padStart(6, "0")}`.slice(0, 11));
    let itemCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/playlists")) {
        return Response.json({ items: [{ snippet: { title: "Playlist", channelTitle: "Channel" } }] });
      }
      if (url.pathname.endsWith("/playlistItems")) {
        itemCalls++;
        return Response.json({
          nextPageToken: "more",
          items: ids.map((id, index) => ({
            snippet: { position: index },
            contentDetails: { videoId: id },
          })),
        });
      }
      return Response.json({ items: [] });
    });

    const result = await fetchYouTubePlaylist("PLabcdefghi12345");
    expect(itemCalls).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("100 videos");
  });

  it("includes public runtime metadata from video content details", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/playlists")) {
        return Response.json({
          items: [{ snippet: { title: "Playlist", channelTitle: "Channel" } }],
        });
      }
      if (url.pathname.endsWith("/playlistItems")) {
        return Response.json({
          items: [
            {
              snippet: { position: 0 },
              contentDetails: {
                videoId: "dQw4w9WgXcQ",
                videoPublishedAt: "2024-01-01T00:00:00Z",
              },
            },
          ],
        });
      }
      return Response.json({
        items: [
          {
            id: "dQw4w9WgXcQ",
            snippet: {
              title: "Episode",
              description: "Public description",
              channelTitle: "Channel",
              thumbnails: { high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" } },
            },
            contentDetails: { duration: "PT4M13S" },
          },
        ],
      });
    });

    const result = await fetchYouTubePlaylist("PLabcdefghi12345");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.playlist.videos[0].runtimeSeconds).toBe(253);
  });
});

describe("privacy guardrails", () => {
  it("does not define private analytics storage or an admin analytics route", () => {
    const root = process.cwd();
    const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
    const publicViewRoute = readFileSync(
      path.join(root, "app/api/public-view/route.ts"),
      "utf8"
    );

    expect(schema).not.toMatch(/model\s+AnalyticsEvent/);
    expect(existsSync(path.join(root, "app/admin/analytics"))).toBe(false);
    expect(publicViewRoute).not.toMatch(
      /x-forwarded-for|cf-connecting-ip|user-agent|request\.ip|headers\.get/i
    );
  });

  it("keeps discovery upgrades public and object-level", () => {
    const root = process.cwd();
    const homeQueries = readFileSync(path.join(root, "lib/queries/home.ts"), "utf8");
    const playlistQueries = readFileSync(
      path.join(root, "lib/queries/playlists.ts"),
      "utf8"
    );
    const wikiQueries = readFileSync(path.join(root, "lib/queries/wiki.ts"), "utf8");

    expect(homeQueries).toContain("markedWatchedCount");
    expect(homeQueries).toContain("runtimeSeconds: { lte: 600 }");
    expect(playlistQueries).toContain("isPublic: true");
    expect(wikiQueries).toContain("isHidden: false");
    expect(`${homeQueries}\n${playlistQueries}\n${wikiQueries}`).not.toMatch(
      /user-agent|x-forwarded-for|fingerprint|AnalyticsEvent/i
    );
  });

  it("keeps public profiles from exposing personal watched-video patterns", () => {
    const root = process.cwd();
    const profileQuery = readFileSync(path.join(root, "lib/queries/profile.ts"), "utf8");
    const profilePage = readFileSync(path.join(root, "app/profile/[username]/page.tsx"), "utf8");

    expect(profileQuery).not.toContain("watchedVideos");
    expect(profileQuery).not.toContain('status: "Completed"');
    expect(profilePage).not.toContain("Recently watched");
  });
});
