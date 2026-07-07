import { describe, expect, it } from "vitest";
import { buildEmbedUrl, parseVideoUrl } from "@/lib/video-url";
import { slugify } from "@/lib/slugify";

const YT_ID = "dQw4w9WgXcQ";

function expectYouTube(input: string, id = YT_ID) {
  const result = parseVideoUrl(input);
  expect(result, input).toEqual(
    expect.objectContaining({ ok: true, provider: "youtube", providerVideoId: id })
  );
}

function expectVimeo(input: string, id: string, hash?: string) {
  const result = parseVideoUrl(input);
  expect(result, input).toEqual(
    expect.objectContaining({
      ok: true,
      provider: "vimeo",
      providerVideoId: id,
      ...(hash ? { vimeoHash: hash } : {}),
    })
  );
}

function expectRejected(input: string) {
  const result = parseVideoUrl(input);
  expect(result.ok, input).toBe(false);
}

describe("parseVideoUrl — YouTube", () => {
  it("accepts every documented link shape", () => {
    expectYouTube(`https://www.youtube.com/watch?v=${YT_ID}`);
    expectYouTube(`http://youtube.com/watch?v=${YT_ID}&t=42s`);
    expectYouTube(`https://m.youtube.com/watch?v=${YT_ID}`);
    expectYouTube(`https://music.youtube.com/watch?v=${YT_ID}`);
    expectYouTube(`https://youtu.be/${YT_ID}?si=AbCdEf123`);
    expectYouTube(`https://www.youtube.com/embed/${YT_ID}`);
    expectYouTube(`https://www.youtube-nocookie.com/embed/${YT_ID}`);
    expectYouTube(`https://www.youtube.com/shorts/${YT_ID}`);
    expectYouTube(`https://www.youtube.com/live/${YT_ID}`);
    expectYouTube(`https://www.youtube.com/v/${YT_ID}`);
    expectYouTube(`youtube.com/watch?v=${YT_ID}`); // scheme-less
  });

  it("extracts the video id when a playlist param is present", () => {
    expectYouTube(`https://www.youtube.com/watch?v=${YT_ID}&list=PLxyz&index=2`);
  });

  it("rejects non-video YouTube links", () => {
    expectRejected("https://www.youtube.com/playlist?list=PLxyz");
    expectRejected("https://www.youtube.com/@jacknjellify");
    expectRejected("https://www.youtube.com/channel/UCxyz");
    expectRejected("https://www.youtube.com/watch"); // no v param
    expectRejected("https://www.youtube.com/watch?v=shortid"); // not 11 chars
    expectRejected("https://youtu.be/");
  });
});

describe("parseVideoUrl — Vimeo", () => {
  it("accepts every documented link shape", () => {
    expectVimeo("https://vimeo.com/76979871", "76979871");
    expectVimeo("https://www.vimeo.com/76979871", "76979871");
    expectVimeo("https://player.vimeo.com/video/76979871", "76979871");
    expectVimeo("https://vimeo.com/channels/staffpicks/76979871", "76979871");
    expectVimeo("https://vimeo.com/groups/cats/videos/76979871", "76979871");
    expectVimeo("vimeo.com/76979871", "76979871"); // scheme-less
  });

  it("captures the unlisted hash", () => {
    expectVimeo("https://vimeo.com/76979871/abcd1234", "76979871", "abcd1234");
    expectVimeo(
      "https://player.vimeo.com/video/76979871?h=abcd1234",
      "76979871",
      "abcd1234"
    );
  });

  it("rejects non-video Vimeo links", () => {
    expectRejected("https://vimeo.com/user12345678");
    expectRejected("https://vimeo.com/");
    expectRejected("https://player.vimeo.com/");
  });
});

describe("parseVideoUrl — everything else", () => {
  it("rejects garbage and other hosts", () => {
    expectRejected("");
    expectRejected("   ");
    expectRejected("not a url");
    expectRejected("javascript:alert(1)");
    expectRejected("https://dailymotion.com/video/x1abcd");
    expectRejected("https://example.com/watch?v=dQw4w9WgXcQ");
    expectRejected("ftp://youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("never echoes markup back in errors", () => {
    const result = parseVideoUrl("<script>alert(1)</script>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("<script>");
  });
});

describe("buildEmbedUrl", () => {
  it("uses the privacy-enhanced YouTube host", () => {
    expect(buildEmbedUrl("youtube", YT_ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`
    );
  });

  it("adds the JS API handshake params for YouTube", () => {
    const url = buildEmbedUrl("youtube", YT_ID, {
      jsApi: true,
      origin: "http://localhost:3000",
    });
    expect(url).toContain("enablejsapi=1");
    expect(url).toContain(`origin=${encodeURIComponent("http://localhost:3000")}`);
  });

  it("uses the official Vimeo player with dnt", () => {
    expect(buildEmbedUrl("vimeo", "76979871")).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1"
    );
  });

  it("passes the Vimeo unlisted hash and api params", () => {
    const url = buildEmbedUrl("vimeo", "76979871", { jsApi: true, vimeoHash: "abcd1234" });
    expect(url).toContain("api=1");
    expect(url).toContain("player_id=osc-player");
    expect(url).toContain("h=abcd1234");
  });

  it("hides provider chrome with official params in theater mode", () => {
    const yt = buildEmbedUrl("youtube", YT_ID, { hideControls: true, captions: true });
    expect(yt).toContain("controls=0");
    expect(yt).toContain("iv_load_policy=3");
    expect(yt).toContain("cc_load_policy=1");

    const vimeo = buildEmbedUrl("vimeo", "76979871", { hideControls: true });
    expect(vimeo).toContain("title=0");
    expect(vimeo).toContain("byline=0");
    expect(vimeo).toContain("portrait=0");
  });
});

describe("slugify", () => {
  it("normalizes show titles", () => {
    expect(slugify("Battle for Dream Island (BFDI)")).toBe(
      "battle-for-dream-island-bfdi"
    );
    expect(slugify("Café & Crème")).toBe("cafe-and-creme");
    expect(slugify("HFJONE")).toBe("hfjone");
    expect(slugify("  spaces   everywhere  ")).toBe("spaces-everywhere");
  });
});
