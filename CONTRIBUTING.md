# Contributing

Thanks for helping! OSC is a small, pragmatic codebase — most contributions
need to touch only one or two files.

## Dev setup

Node 20.9+ and PostgreSQL 14+:

```bash
createdb osc
npm install
cp .env.example .env   # DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), ADMIN_PASSWORD
npm run dev
```

The app creates its own schema on first boot — there are no migrations to run.

## Before opening a PR

```bash
npm test        # vitest — includes the privacy guardrail tests
npm run lint
npm run build   # type-checks
```

If you changed `prisma/schema.prisma`, also run `npm run build:host` (commits
the regenerated `lib/generated/ddl.ts`) **and** add the matching idempotent
ALTER to `ensureExpansionSchema()` in `lib/bootstrap-db.ts` — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#adding-a-schema-change).

## Ground rules

- **No reuploads, no proxying, no file hosting.** Videos stay official
  embeds; images stay external URLs. PRs that change this won't be merged.
- **Privacy guardrails are load-bearing.** No analytics events, IP logging,
  or fingerprinting — the test suite enforces it.
- **All user HTML goes through `lib/safe-url.ts` helpers.** Never build HTML
  from user input anywhere else.
- Reads in `lib/queries/`, writes in `actions/` with `getSessionUser()` +
  `revalidatePath()`.
- Match the style around you; comments explain *why*, not *what*.

## Good first contributions

- New wiki templates (`lib/wiki-renderer.ts`)
- Discover filters/sorts (`lib/queries/videos.ts`)
- Accessibility & mobile polish
- Test coverage for `lib/` utilities
- The bigger recipes in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#recipes-for-future-work)
