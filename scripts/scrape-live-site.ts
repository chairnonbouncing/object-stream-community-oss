/**
 * Emergency backup tool: extracts the full public catalog + community content
 * from a RUNNING OSC deployment through its own pages (for hosts with no
 * shell/database access). Signs in as admin to include hidden videos and
 * exact metadata from the edit forms.
 *
 * Usage:
 *   BASE_URL=https://site ADMIN_USERNAME=admin ADMIN_PASSWORD=... \
 *     npx tsx scripts/scrape-live-site.ts
 *
 * Writes backups/live-dump.json (consumed by the boot-time restore).
 */

const BASE = process.env.BASE_URL ?? "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

if (!BASE || !ADMIN_PASSWORD) {
  console.error(
    "Usage: BASE_URL=https://your-site ADMIN_USERNAME=admin ADMIN_PASSWORD=… npx tsx scripts/scrape-live-site.ts"
  );
  process.exit(1);
}

const jar = new Map<string, string>();

function storeCookies(res: Response) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const c of cookies) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader() },
    redirect: "follow",
  });
  storeCookies(res);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function inputValue(html: string, id: string): string | null {
  const patterns = [
    new RegExp(`<input[^>]*id="${id}"[^>]*\\svalue="([^"]*)"`, "i"),
    new RegExp(`<input[^>]*\\svalue="([^"]*)"[^>]*id="${id}"`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decode(m[1]);
  }
  // input rendered without a value attribute = empty field
  return new RegExp(`<input[^>]*id="${id}"`).test(html) ? "" : null;
}

function textareaValue(html: string, id: string): string {
  const m = html.match(new RegExp(`<textarea[^>]*id="${id}"[^>]*>([\\s\\S]*?)</textarea>`, "i"));
  return m ? decode(m[1]) : "";
}

function selectedOption(html: string, id: string): string | null {
  const block = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`, "i"));
  if (!block) return null;
  const sel = block[1].match(/<option[^>]*selected[^>]*value="([^"]*)"|<option[^>]*value="([^"]*)"[^>]*selected/i);
  return sel ? decode(sel[1] ?? sel[2]) : null;
}

async function signIn() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  storeCookies(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      callbackUrl: `${BASE}/`,
    }),
    redirect: "manual",
  });
  storeCookies(res);
  const ok = [...jar.keys()].some((k) => k.includes("session-token"));
  if (!ok) throw new Error("Sign-in failed — check ADMIN_PASSWORD");
  console.log("✔ signed in as admin");
}

type DumpVideo = {
  liveId: string;
  provider: string;
  providerVideoId: string;
  originalUrl: string | null;
  showTitle: string;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  description: string | null;
  genreTags: string;
  language: string;
  releaseYear: number | null;
  status: string;
  thumbnailUrl: string | null;
  viewCount: number;
  isFeatured: boolean;
  isHidden: boolean;
  addedDate: string | null;
  submittedBy: string | null;
  reviews: Array<{
    username: string;
    rating: number | null;
    date: string | null;
    text: string;
  }>;
};

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Set ADMIN_PASSWORD");
  await signIn();

  // --- expected totals from the mod dashboard --------------------------------
  const dash = await get("/admin");
  const counts = [...dash.matchAll(/font-display[^>]*>(\d+)<\/p>\s*<p[^>]*>([^<]+)</g)].map(
    (m) => `${m[2].trim()}=${m[1]}`
  );
  console.log("dashboard:", counts.join(", "));

  // --- video ids + flags from the admin tables -------------------------------
  const flags = new Map<string, { isHidden: boolean; isFeatured: boolean }>();
  for (const path of ["/admin/videos", "/admin/videos?hidden=1"]) {
    const html = await get(path);
    for (const li of html.split("<li").slice(1)) {
      const idm = li.match(/\/admin\/videos\/([a-z0-9]+)"/);
      if (!idm) continue;
      flags.set(idm[1], {
        isHidden: li.includes("🚫 Hidden"),
        isFeatured: li.includes("★ Featured"),
      });
    }
  }
  console.log(`✔ found ${flags.size} videos in admin tables`);

  // --- per-video detail -------------------------------------------------------
  const videos: DumpVideo[] = [];
  const usernames = new Set<string>();
  for (const [id, flag] of flags) {
    try {
      // React SSR interleaves `<!-- -->` comment nodes between text segments —
      // every cross-segment regex needs a bounded [\s\S] gap, not [^<].
      const edit = await get(`/watch/${id}/edit`);
      const provM = edit.match(/(youtube|vimeo)[\s\S]{0,60}?<code[^>]*>([^<]+)<\/code>/);
      const watch = await get(`/watch/${id}`);

      const viewM = watch.match(/([\d.,]+[KM]?)(?:<!-- -->)?\s*watches/);
      const addedM = watch.match(/added [\s\S]{0,30}?([A-Z][a-z]{2} \d{1,2}, \d{4})/);
      const subM = watch.match(
        /added [\s\S]{0,120}?by[\s\S]{0,240}?\/profile\/([a-z0-9_]+)"/
      );
      const origM = watch.match(/href="(https?:\/\/[^"]+)"[^>]*\s+target="_blank"/);

      const reviews: DumpVideo["reviews"] = [];
      const reviewSection = watch.split("Reviews")[1] ?? "";
      for (const li of reviewSection.split("<li").slice(1)) {
        const user = li.match(/\/profile\/([a-z0-9_]+)"/);
        const text = li.match(/<p class="mt-2 whitespace-pre-wrap[^"]*">([\s\S]*?)<\/p>/);
        if (!user || !text) continue;
        const stars = li.match(/title="(\d)\.0 out of 5"/);
        const date = li.match(/>([A-Z][a-z]{2} \d{1,2}, \d{4})</);
        reviews.push({
          username: user[1],
          rating: stars ? Number(stars[1]) : null,
          date: date ? date[1] : null,
          text: decode(text[1]).trim(),
        });
        usernames.add(user[1]);
      }

      const num = (s: string | null) => (s && s !== "" ? Number(s) : null);
      const viewRaw = viewM ? viewM[1] : "0";
      const viewCount = viewRaw.endsWith("K")
        ? Math.round(parseFloat(viewRaw) * 1000)
        : viewRaw.endsWith("M")
          ? Math.round(parseFloat(viewRaw) * 1_000_000)
          : Number(viewRaw.replace(/,/g, "")) || 0;

      const video: DumpVideo = {
        liveId: id,
        provider: provM ? provM[1] : "youtube",
        providerVideoId: provM ? provM[2].trim() : "",
        originalUrl: origM ? decode(origM[1]) : null,
        showTitle: inputValue(edit, "showTitle") ?? "",
        episodeTitle: inputValue(edit, "episodeTitle") || null,
        seasonNumber: num(inputValue(edit, "seasonNumber")),
        episodeNumber: num(inputValue(edit, "episodeNumber")),
        description: textareaValue(edit, "description") || null,
        genreTags: inputValue(edit, "genreTags") ?? "",
        language: selectedOption(edit, "language") ?? "English",
        releaseYear: num(inputValue(edit, "releaseYear")),
        status: selectedOption(edit, "status") ?? "Ongoing",
        thumbnailUrl: inputValue(edit, "thumbnailUrl") || null,
        viewCount,
        isFeatured: flag.isFeatured,
        isHidden: flag.isHidden,
        addedDate: addedM ? addedM[1] : null,
        submittedBy: subM ? subM[1] : null,
        reviews,
      };
      if (video.submittedBy) usernames.add(video.submittedBy);
      if (!video.showTitle || !video.providerVideoId) {
        console.warn(`  ⚠ ${id}: incomplete parse (title="${video.showTitle}")`);
      }
      videos.push(video);
      console.log(
        `  • ${video.showTitle} — ${video.episodeTitle ?? "(no ep title)"} [${video.provider}:${video.providerVideoId}] ${reviews.length} reviews`
      );
    } catch (e) {
      console.warn(`  ⚠ failed video ${id}: ${(e as Error).message}`);
    }
  }

  // --- public playlists --------------------------------------------------------
  const listHtml = await get("/playlists");
  const playlistIds = [...new Set([...listHtml.matchAll(/\/playlists\/([a-z0-9]+)"/g)].map((m) => m[1]))];
  const playlists: Array<{
    liveId: string;
    name: string;
    description: string | null;
    owner: string | null;
    videoLiveIds: string[];
  }> = [];
  for (const pid of playlistIds) {
    try {
      const html = await get(`/playlists/${pid}`);
      const name = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const desc = html.match(/<p class="max-w-2xl[^"]*">([\s\S]*?)<\/p>/);
      const owner = html.match(/\/profile\/([a-z0-9_]+)"/);
      const items = [
        ...new Set(
          [...html.matchAll(new RegExp(`/watch/([a-z0-9]+)\\?list=${pid}`, "g"))].map((m) => m[1])
        ),
      ];
      playlists.push({
        liveId: pid,
        name: name ? decode(name[1].replace(/<[^>]+>/g, "")).trim() : pid,
        description: desc ? decode(desc[1]).trim() : null,
        owner: owner ? owner[1] : null,
        videoLiveIds: items,
      });
      if (owner) usernames.add(owner[1]);
      console.log(`  • playlist "${playlists.at(-1)!.name}" (${items.length} items)`);
    } catch (e) {
      console.warn(`  ⚠ failed playlist ${pid}: ${(e as Error).message}`);
    }
  }

  // --- profiles ---------------------------------------------------------------
  const users: Array<{
    username: string;
    bio: string | null;
    avatarUrl: string | null;
    joined: string | null;
    favoriteShows: Array<{ slug: string; title: string }>;
  }> = [];
  for (const username of usernames) {
    try {
      const html = await get(`/profile/${username}`);
      const bio = html.match(/<p class="max-w-xl text-sm text-cream\/75">([\s\S]*?)<\/p>/);
      const joined = html.match(/Joined ([A-Z][a-z]+ \d{4})/);
      const avatar = html.match(/<img src="([^"]+)"[^>]*referrerPolicy/i);
      const favSection = html.split("Favorite shows")[1]?.split("</section>")[0] ?? "";
      const favoriteShows = [...favSection.matchAll(/\/shows\/([a-z0-9-]+)"[^>]*>([^<]+)</g)].map(
        (m) => ({ slug: m[1], title: decode(m[2]).trim() })
      );
      users.push({
        username,
        bio: bio ? decode(bio[1]).trim() : null,
        avatarUrl: avatar ? decode(avatar[1]) : null,
        joined: joined ? joined[1] : null,
        favoriteShows,
      });
    } catch (e) {
      console.warn(`  ⚠ failed profile ${username}: ${(e as Error).message}`);
    }
  }

  const dump = {
    scrapedAt: new Date().toISOString(),
    base: BASE,
    dashboard: counts,
    videos,
    playlists,
    users,
  };

  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("backups", { recursive: true });
  writeFileSync("backups/live-dump.json", JSON.stringify(dump, null, 2));
  console.log(
    `\n✔ backups/live-dump.json — ${videos.length} videos, ${playlists.length} playlists, ${users.length} users, ${videos.reduce((a, v) => a + v.reviews.length, 0)} reviews`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
