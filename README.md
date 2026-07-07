# Object Stream Community

A free, self-hostable, community-driven **video discovery and watch platform** —
built for the Object Show animation community, easily rebrandable for any
fandom that organizes YouTube/Vimeo content into shows, episodes, playlists,
and a wiki.

**The platform hosts nothing.** Every video plays through the official YouTube
or Vimeo embedded player, so original creators keep their views, ads, and
credit. No reuploads, no file uploads, no proxying — ever. The catalog stores
only safe embed data (provider + video ID), never raw iframes or URLs from
unknown hosts.

## Features

- **Catalog & discovery** — search with filters (genre, status, year, language,
  platform), sort by recency/rating/popularity, automatic show pages grouped by
  season, "Today's Picks" hero carousel
- **Theater-mode player** — Netflix-style fullscreen chrome over the official
  embed: play/pause, ±10s, scrubber with hover timestamps, playback speed,
  mute, captions, episode picker, auto-advance to the next episode. Keyboard
  shortcuts everywhere (`Space`/`K`, `←`/`→`, `F`, `M`, `C`) and
  resume-where-you-left-off per video
- **Playlists** — public/private, reorderable, with a play-through watch mode
- **Mass import** — paste a YouTube playlist link, preview every video, import
  the lot as a show + playlist in one transaction
- **Wiki** — MediaWiki-style wikitext with infoboxes, templates, tables,
  references, categories, auto table of contents, per-show wiki "spaces" with
  multiple pages, revision history with restore, discussions, watch lists, a
  recent-changes feed, and a visual (rich text) editor
- **Community editing with version history** — any signed-in user can fix video
  metadata or edit public playlists; every change is snapshotted and any
  version can be restored if something gets griefed
- **Watch tracking** — Watching / Completed / Plan to Watch / On Hold /
  Dropped / Rewatching, favorites, per-user profiles with public stats
- **Reviews & ratings** — star ratings with aggregates, text reviews,
  moderation
- **Privacy-respecting public stats** — view counters and popularity signals
  with **no** analytics events, IP logging, fingerprinting, or user-agent
  storage (enforced by tests)
- **Moderation** — reports on anything, an admin dashboard for
  hide/feature/delete, protected wiki pages, hidden-content preview
- **Zero-ops database** — the app creates its own schema, runs its own
  forward-migrations, creates the admin account, and can restore itself from a
  backup file, all at boot. No migration commands to run, ever.
- **Hardened** — rate limiting on auth/imports/metadata lookups/reports/view
  counters, strict CSP, escaped-by-construction wiki renderer

## Quick start (local)

Requirements: **Node 20.9+** and **PostgreSQL 14+**.

```bash
createdb osc                     # or create a database any way you like
git clone <this repo> && cd object-stream-community
npm install
cp .env.example .env             # fill in DATABASE_URL, AUTH_SECRET, ADMIN_PASSWORD
npm run dev                      # http://localhost:3000
```

That's it. On first boot the app sees an empty database, creates the whole
schema, and creates the `admin` account from `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
Sign in as admin and start submitting videos.

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — a full guide for Render
(one-click blueprint included), Railway, Fly.io, Vercel + hosted Postgres,
Docker on any VPS, and bare Node, plus backup/restore and upgrade procedures.

## Customizing

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** — every environment
variable, plus exactly which file to edit for branding, colors, fonts, genres,
age ratings, the intro splash, rate limits, CSP, navigation, and more.

## Understanding & extending the code

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the codebase is laid
out, how the self-bootstrapping database works, how the wiki render pipeline
and revision system work, and step-by-step recipes for future work (adding a
model/page/provider, moving rate limiting to Redis, turning imports into
background jobs, adding email, and more).

## Useful commands

```bash
npm run dev          # dev server
npm run build        # production build + type-check
npm test             # vitest (URL parsers, wiki renderer, privacy guardrails)
npm run lint         # eslint
npm run build:host   # prisma generate + regenerate DDL + build (use in CI/Docker)
npx prisma studio    # inspect the database
```

## License

MIT — see [LICENSE](LICENSE).
