# Configuration & Customization

Everything you might want to change, and exactly where it lives. OSC was built
for the Object Show community, but nothing fandom-specific is load-bearing —
this page is effectively the "rebrand me" manual.

- [Environment variables](#environment-variables)
- [Branding](#branding)
- [Theme: colors & fonts](#theme-colors--fonts)
- [Domain vocabulary (genres, ratings, statuses)](#domain-vocabulary)
- [Navigation & pages](#navigation--pages)
- [The intro splash](#the-intro-splash)
- [Video player](#video-player)
- [Wiki templates & stubs](#wiki-templates--stubs)
- [Rate limits](#rate-limits)
- [Security headers / CSP](#security-headers--csp)
- [Image & link safety rules](#image--link-safety-rules)
- [Public stats & privacy guardrails](#public-stats--privacy-guardrails)

---

## Environment variables

See the full table in [DEPLOYMENT.md](DEPLOYMENT.md#environment-variables).
Short version: `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_PASSWORD` are required;
`AUTH_TRUST_HOST=true` on any PaaS; `YOUTUBE_API_KEY` only for mass imports.

---

## Branding

| What | Where |
| --- | --- |
| Site name & description (browser tabs, social embeds) | `app/layout.tsx` → `metadata` (title default + template, description) |
| Header logo | `public/images/logobig.jpeg`, rendered in `components/layout/site-header.tsx` |
| Small logo / misc | `public/images/logosmall.svg` |
| Favicon | `app/icon.svg` |
| Footer text | `components/layout/site-footer.tsx` |
| Placeholder thumbnail | `public/images/placeholder-thumb.svg` |
| "About" page copy | `app/about/` |
| Wiki index intro copy | `app/wiki/page.tsx` |

The name "Object Stream Community" appears in user-facing copy in a handful of
places — `git grep -il "object stream"` finds them all in seconds.

---

## Theme: colors & fonts

The entire palette is CSS variables in **`app/globals.css`** under
`@theme inline` (Tailwind 4 reads these as `bg-night`, `text-cream`,
`border-line`, `text-osc-blue`, etc. — used consistently across every
component):

```css
--color-night:   #0b0a13;   /* page background */
--color-surface: #151021;   /* cards */
--color-surface-2: #1e1731; /* nested surfaces */
--color-line:    #2a2342;   /* borders */
--color-osc-blue / purple / green / star / red   /* accents */
--color-cream:   #f4f1ff;   /* text */
```

Change these seven-ish values and the whole site re-skins. The decorative
background glows are the `radial-gradient`s on `body` in the same file.

**Fonts** are wired in `app/layout.tsx`:
- Display font: `app/fonts/shag-lounge.otf` (local file → `--font-shag`).
  Swap the file or the `localFont` call.
- Body font: Baloo 2 via `next/font/google` → `--font-baloo`.

The player's accent is intentionally Netflix red and lives as `NETFLIX_RED`
in `components/watch/theater-player.tsx`.

---

## Domain vocabulary

All in **`lib/constants.ts`** — single source of truth, typed, and reused by
forms, filters, validation, and badges:

| Constant | Controls |
| --- | --- |
| `GENRES` | Genre checkboxes on submit/import/edit, discover filters, genre rows on home |
| `AGE_RANGE_TAGS` | Age badges & filters ("All Ages" … "18+", "Unrated", "Unknown") |
| `SHOW_STATUSES` | Ongoing / Completed / Hiatus / … |
| `WATCH_STATUSES` | My List statuses (Watching, Plan to Watch, …) |
| `WIKI_PAGE_TYPES` | Wiki page type dropdown (Show, Character, Episode, Lore, …) |
| `PROVIDERS` | `["youtube", "vimeo"]` — see [ARCHITECTURE.md](ARCHITECTURE.md#adding-a-new-video-provider) before touching |

Values are stored as plain strings on rows, so renaming an existing value
means updating existing rows too (one `UPDATE` in `ensureExpansionSchema()` is
the clean way — see the architecture doc).

---

## Navigation & pages

- Header links: `components/layout/nav-links.tsx` — a plain array.
- Header search targets `/discover`; the wiki has its own search on `/wiki`.
- Route map = `app/` directory (App Router). Notable: `discover`, `shows`,
  `watch/[videoId]`, `playlists`, `wiki` (+ `changes`, `category/[slug]`,
  `random`), `import/youtube-playlist`, `admin`, `my-list`,
  `profile/[username]`, `upcoming`.

---

## The intro splash

`components/layout/intro-splash.tsx` plays `public/videos/opening.mp4`
full-screen **once per browser session** (skippable, muted-autoplay fallback,
honors `prefers-reduced-motion`). Swap the file to change it; delete the
`<IntroSplash />` line in `app/layout.tsx` to remove it.

---

## Video player

`components/watch/theater-player.tsx` is the whole theater experience
(controls overlay, keyboard shortcuts, resume, speed, captions, episodes
sheet). Tunables at the top of the file:

- `CONTROLS_HIDE_MS` — chrome fade delay (default 3000)
- `SPEEDS` — playback-rate cycle (default 1 → 1.25 → 1.5 → 2 → 0.75)
- `RESUME_MIN_SECONDS` — minimum watch time before a resume point is saved
- Resume points live in `localStorage` (`osc-resume-<provider>-<id>`), and are
  cleared automatically near the end of a video

Keyboard shortcuts are the `onKeyDown` switch in the same file. Embed URL
construction (autoplay, JS API, chrome-less theater params) is
`lib/video-url.ts → buildEmbedUrl`.

---

## Wiki templates & stubs

- **Wikitext syntax** (headings, `[[links]]`, `{{Infobox …}}`, `{{Stub}}`,
  tables, `<ref>`, `[[Image:…]]`, `[[YouTube:id]]`) is implemented in
  **`lib/wiki-renderer.ts`**. Add a new `{{Template}}` by following the
  existing `.replace(/\{\{Stub\}\}/gi, …)` pattern — everything is
  escaped-by-construction, so keep new HTML inside the existing helpers.
- **Auto-created stub pages** (when a show/episode is imported) are the
  template strings in **`lib/shows.ts`** (`showStubContent`,
  `episodeStubContent`).
- Wiki page CSS: the `.wiki-*` classes in `app/globals.css`.
- The visual editor (TipTap) is `components/wiki/wiki-editor-form.tsx`.

---

## Rate limits

`lib/rate-limit.ts` is a fixed-window in-memory limiter; every limit is set at
its call site so they're greppable (`git grep -n "rateLimit("`):

| Action | Limit | Where |
| --- | --- | --- |
| Login | 15 / 10 min per IP **and** per username | `actions/auth.ts` |
| Signup | 5 / hour per IP | `actions/auth.ts` |
| Account reclaim | 5 / 15 min per IP | `actions/auth.ts` |
| URL preview / video info | 30 / 10 min per IP | `actions/videos.ts` |
| Import preview | 12 / 10 min per user | `actions/imports.ts` |
| Import confirm | 6 / hour per user | `actions/imports.ts` |
| Reports | 10 / 10 min per user | `actions/reports.ts` |
| View counter | 30 / 5 min per target + 600/min global, **no identity** | `app/api/public-view/route.ts` |

Multi-instance deployments: see
[ARCHITECTURE.md](ARCHITECTURE.md#swapping-the-rate-limiter-for-redis).

---

## Security headers / CSP

`next.config.ts` sets a site-wide Content-Security-Policy plus
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and
`Permissions-Policy`. Things you might legitimately loosen:

- **`img-src * data: blob:`** — already open because thumbnails and wiki
  images are hot-linked from arbitrary hosts by design.
- **`frame-src`** — allows only the YouTube (nocookie + regular) and Vimeo
  players. Add hosts here if you add a provider.
- **`connect-src 'self'`** — widen if you add client-side calls to external
  APIs.

---

## Image & link safety rules

`lib/safe-url.ts` is the choke point:

- `safeExternalHref` — external links must be http(s).
- `safeExternalImageUrl` — images must be on a trusted host
  (`i.ytimg.com`, `img.youtube.com`, `i.vimeocdn.com`) **or** have a real
  image extension. Extend `TRUSTED_IMAGE_HOSTS` to allow e.g. a fandom CDN.
- `escapeHtml` — used by every HTML-producing path (wiki renderer,
  description linkifier). Don't build HTML strings anywhere else.

---

## Public stats & privacy guardrails

View counts and popularity stats are **object-level only**. The test suite
(`lib/__tests__/expansion.test.ts` → "privacy guardrails") **fails the build**
if anyone:

- adds an `AnalyticsEvent`-style model,
- creates an admin analytics route,
- reads `x-forwarded-for` / user-agent / fingerprints in the public-view
  endpoint or discovery queries.

If you extend stats, keep them aggregate and anonymous — or consciously delete
the guardrail test and own that decision.
