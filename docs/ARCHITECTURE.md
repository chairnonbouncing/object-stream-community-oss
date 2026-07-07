# Architecture & Extension Guide

How the codebase fits together, and step-by-step recipes for the changes
you're most likely to make next.

- [Layout of the codebase](#layout-of-the-codebase)
- [Key flows](#key-flows)
  - [Boot: the self-bootstrapping database](#boot-the-self-bootstrapping-database)
  - [Auth & sessions](#auth--sessions)
  - [Submitting & importing videos](#submitting--importing-videos)
  - [The wiki render pipeline](#the-wiki-render-pipeline)
  - [Revisions: nothing is ever lost](#revisions-nothing-is-ever-lost)
  - [Public stats](#public-stats)
  - [The theater player](#the-theater-player)
- [Recipes for future work](#recipes-for-future-work)
  - [Adding a schema change (new model or column)](#adding-a-schema-change)
  - [Adding a page + server action](#adding-a-page--server-action)
  - [Adding a new video provider](#adding-a-new-video-provider)
  - [Adding a new wiki template](#adding-a-new-wiki-template)
  - [Swapping the rate limiter for Redis](#swapping-the-rate-limiter-for-redis)
  - [Moving playlist imports to a background job](#moving-playlist-imports-to-a-background-job)
  - [Adding email (password resets, notifications)](#adding-email)
  - [Adding uploaded images](#adding-uploaded-images)
  - [Scaling beyond one instance](#scaling-beyond-one-instance)

---

## Layout of the codebase

```
app/                  Routes (Next.js App Router). Pages are server components
                      that query via lib/queries/* and render components/*.
  api/                The few true API routes (public view counter).
actions/              All mutations, as "use server" actions grouped by domain:
                      auth, videos, playlists, imports, wiki, reviews, reports,
                      admin, profile. Every action re-checks auth itself.
components/           React components grouped by surface (watch/, wiki/,
                      layout/, ui/ = design-system primitives).
lib/                  Everything shared:
  bootstrap-db.ts     Boot-time schema creation / forward-migrations / admin.
  generated/ddl.ts    Committed SQL snapshot of the Prisma schema.
  queries/            Read-side helpers used by pages.
  wiki-renderer.ts    Wikitext → safe HTML.
  revisions.ts        Snapshot/restore machinery for videos & playlists.
  public-stats.ts     Derived counters (views, watched, playlist adds…).
  rate-limit.ts       In-memory fixed-window limiter.
  safe-url.ts         URL/HTML safety choke point.
  video-url.ts        Provider URL parsing + embed URL construction.
  constants.ts        Domain vocabulary (genres, statuses, providers…).
prisma/schema.prisma  The schema. Source of truth for models.
scripts/              generate-ddl.mjs (schema → ddl.ts), scrape-live-site.ts
                      (application-level backup), check-data-preservation.ts.
instrumentation.ts    Runs ensureDatabase() once per server boot.
```

Conventions worth knowing:

- **Reads** live in `lib/queries/*`, **writes** in `actions/*`. Pages never
  call Prisma mutations directly.
- Every action returns `FormState`/`ActionResult` shapes (`lib/types.ts`) and
  is wired to forms via React 19 `useActionState`.
- **React 19 gotcha:** uncontrolled inputs reset after a server action
  round-trip. Multi-step forms must echo submitted values back through action
  state and re-populate `defaultValue`s — see `echoForm()` in
  `actions/imports.ts` for the canonical pattern.
- All user-generated HTML goes through `lib/safe-url.ts` helpers. There are
  exactly three `dangerouslySetInnerHTML` sinks (wiki article, wiki editor
  preview, description block) and all of them render escaped-by-construction
  output.
- Postgres string search needs `mode: "insensitive"` — `contains` alone is
  case-sensitive on Postgres.

## Key flows

### Boot: the self-bootstrapping database

`instrumentation.ts` → `lib/bootstrap-db.ts ensureDatabase()`:

```
empty DB?  ──▶ execute lib/generated/ddl.ts (full schema)
always     ──▶ ensureExpansionSchema(): idempotent ALTERs / CREATE TABLE IF
               NOT EXISTS for every feature added since the original schema
always     ──▶ ensure admin account (ADMIN_USERNAME/ADMIN_PASSWORD)
empty catalog + backups/live-dump.json present? ──▶ restore from dump
needed?    ──▶ background backfills (show grouping, derived stats) — fired
               behind boot, never blocking startup
```

There are **no migration files**. `lib/generated/ddl.ts` is regenerated from
`prisma/schema.prisma` by `scripts/generate-ddl.mjs` (part of
`npm run build:host`), and existing databases are upgraded by the hand-written
idempotent statements in `ensureExpansionSchema()`.

### Auth & sessions

NextAuth v5 credentials provider (`auth.ts`), bcrypt password hashes, JWT
sessions. `getSessionUser()` (`lib/auth-helpers.ts`) is the canonical "who is
calling" helper used by every action; `isAdmin` is a column on `User`.
Restored-from-backup accounts carry `mustResetPassword` and go through the
one-time reclaim flow (`actions/auth.ts reclaimAccount`) — an atomic
`updateMany` guard makes reclaim single-use.

### Submitting & importing videos

- **Single submit** (`actions/videos.ts`): parse the URL
  (`lib/video-url.ts` — strict host allowlists, ID regexes), fetch title via
  keyless oEmbed, upsert the show (`lib/shows.ts ensureShow`), create the
  video, auto-create wiki stubs.
- **Playlist import** (`actions/imports.ts`): two-phase form (preview →
  confirm) against the YouTube Data API (`lib/youtube-playlists.ts`,
  requires `YOUTUBE_API_KEY`). The confirm runs one transaction (120 s
  budget): ensure show → create/update videos → wiki stubs → create playlist →
  snapshot → record the import.
- Videos are grouped into shows by `showSlug`; show pages and wiki spaces
  derive from that grouping.

### The wiki render pipeline

```
wikitext ──▶ renderWikitext() ──▶ { html, summary, categories, infoboxData, redirect }
             (lib/wiki-renderer.ts)        │
save (actions/wiki.ts) stores BOTH ────────┤  contentWikitext + renderedHtml
                                           ▼
display (app/wiki/[slug]) ──▶ addHeadingAnchors(renderedHtml) → TOC + anchors
```

Rendered HTML is **stored** at save time (pages are read far more than
written). Display-time transforms that must apply to *already-stored* pages —
like the table of contents — live in `lib/wiki-toc.ts` and run on render.
Categories sync to real rows (`WikiCategory`/`WikiPageCategory`) in
`lib/shows.ts syncWikiCategories`.

Every edit writes a `WikiRevision`; the history page can restore any of them.

### Revisions: nothing is ever lost

`lib/revisions.ts`: before the first community edit of a video/playlist, a
baseline snapshot is taken (`ensureVideoBaseline`); every subsequent edit
snapshots the new state with editor + note. History pages let anyone restore
an earlier version. The wiki has the same model with `WikiRevision`. This is
the safety net that makes open community editing viable.

### Public stats

`lib/public-stats.ts` maintains **denormalized, aggregate-only** counters
(viewCount, markedWatchedCount, playlistAddCount, estimatedSecondsWatched…)
refreshed transactionally alongside the writes that change them, plus a
full-catalog backfill used at boot when needed. The view-counter endpoint
(`app/api/public-view/route.ts`) is deliberately identity-blind — see the
privacy guardrails section in [CONFIGURATION.md](CONFIGURATION.md).

### The theater player

`components/watch/theater-player.tsx` talks to the YouTube/Vimeo iframes over
`postMessage` (no SDK scripts). Notables:

- Toggling theater swaps the iframe `src` (to drop provider chrome), then
  restores time/play-state/captions/mute/speed via `pendingRestoreRef` once
  the new player handshakes.
- YouTube needs a repeated `{"event":"listening"}` handshake before it emits
  events; Vimeo needs `addEventListener` calls after `ready`.
- Resume positions: `localStorage`, saved max every 5 s, cleared near the end
  of a video.
- Auto-advance: on the provider "ended" event, `router.push(nextHref)` —
  playlist order when playing from a list, otherwise show episode order.

---

## Recipes for future work

### Adding a schema change

1. Add the model/column to `prisma/schema.prisma`.
2. Run `npm run build:host` once — regenerates `lib/generated/ddl.ts` so
   **fresh installs** get it.
3. Add the matching idempotent statement to `ensureExpansionSchema()` in
   `lib/bootstrap-db.ts` so **existing databases** get it, using the helpers
   already there (`pgAddColumn(table, column, definition)` or
   `CREATE TABLE IF NOT EXISTS …`).
4. Commit schema + ddl.ts + bootstrap together. Deploy; the change applies at
   boot.

Data fixes follow the same pattern — write an idempotent `UPDATE … WHERE`
in `ensureDatabase()` (see the wiki-summary repair there for an example).

### Adding a page + server action

1. Page: `app/<route>/page.tsx`, a server component. Read data via a function
   in `lib/queries/` (respect `isHidden` unless `user?.isAdmin`).
2. Mutation: add to the matching `actions/<domain>.ts` (`"use server"`),
   start with `getSessionUser()`, return `FormState`, call
   `revalidatePath()` for every surface that shows the changed data.
3. Form: client component with `useActionState(action, undefined)`. If it's
   multi-step, echo fields back (see `actions/imports.ts echoForm`).
4. If the write should be griefer-proof, snapshot it (`lib/revisions.ts`) like
   videos/playlists do.

### Adding a new video provider

Touch points, in order:

1. `lib/constants.ts` → add to `PROVIDERS`.
2. `lib/video-url.ts` → host allowlist + ID regex in `parseVideoUrl`,
   embed URL in `buildEmbedUrl`, thumbnail resolution in `resolveThumbnail`.
3. `lib/oembed.ts` → title/thumbnail lookup (if the provider has oEmbed).
4. `components/watch/theater-player.tsx` → the `sendToPlayer` /
   `onMessage` wire for the provider's iframe API (this is the real work —
   pattern-match the Vimeo branch).
5. `next.config.ts` → add the player origin to `frame-src` in the CSP.
6. `lib/wiki-renderer.ts` → optional `[[Provider:id]]` embed template.
7. Badge colors/labels: grep for `"youtube" ? "YouTube"`.

The URL-parser test matrix (`lib/__tests__`) makes step 2 safe — add cases.

### Adding a new wiki template

In `lib/wiki-renderer.ts`, add a `.replace(/\{\{YourTemplate\}\}/gi, …)`
alongside the existing ones (`{{Stub}}`, `{{Spoilers}}`, …), building HTML
only via `notice()`/`escapeHtml()`/`inline()`. Style it with a `.wiki-*` class
in `app/globals.css`. Document it on the wiki editor's help panel
(`components/wiki/wiki-editor-form.tsx`).

### Swapping the rate limiter for Redis

`lib/rate-limit.ts` is the only file to change — keep the signature
`rateLimit(key, limit, windowMs): boolean` (make it async and await it at the
~10 call sites; they're all `git grep -n "rateLimit("` away). A Redis
`INCR` + `EXPIRE` per key is a drop-in equivalent. Needed only when you run
more than one app instance.

### Moving playlist imports to a background job

Currently the confirm step runs synchronously (fine to ~200 videos thanks to
the 120 s transaction budget). To go async:

1. Add an `ImportJob` model (status, payload, progress, error) via the
   [schema recipe](#adding-a-schema-change).
2. The confirm action just creates the job row and redirects to a status page.
3. Process jobs either in-process (a `setInterval` worker started from
   `instrumentation.ts` — simplest, fits the single-instance design) or in a
   separate worker container polling the table.
4. Chunk the work per-video instead of one giant transaction, marking
   progress on the job row; the existing dedup logic makes re-runs safe.

### Adding email

There is deliberately no SMTP dependency. The clean insertion points:

- Password reset: replace/augment the reclaim flow in `actions/auth.ts` —
  generate a token model (schema recipe), email a link, verify + reset.
- Notifications (wiki watchers, report outcomes): the write sites already
  exist (`actions/wiki.ts`, `actions/admin.ts`) — fire emails there, or add a
  `Notification` model and render in-app first (cheaper, no deliverability
  war).
- Use a queue-less provider SDK (Resend, Postmark) called inside the action;
  at this scale that's fine.

### Adding uploaded images

Currently images are **external URLs only** (`lib/safe-url.ts` gates them) —
zero storage costs and no moderation surface for binary content. If you decide
to accept uploads anyway: add an S3-compatible bucket, a small upload action
(size/type limits, strip EXIF), store the resulting URL in the same fields,
and add your bucket's host to `TRUSTED_IMAGE_HOSTS` and the CSP. Nothing else
changes — the rest of the app only ever sees URLs.

### Scaling beyond one instance

The things that assume a single process, in the order they'll bite:

1. **Rate limiter** — per-instance windows (see Redis recipe).
2. **Boot backfills/repairs** — two instances booting simultaneously will
   both run them; they're idempotent so it's wasted work, not corruption. Add
   a Postgres advisory lock (`pg_advisory_lock`) around `ensureDatabase()` if
   it matters.
3. **In-process background jobs** (if you add them) — move to a worker.

The database layer, sessions (JWT), resume positions (client-side), and
everything else are already multi-instance safe.
