# Universal fallback: runs the exact same app on any Docker/Node host.
# Minimum patched Node 22 release from Render's 2026-10-26 advisory.
# Keep this patch pin current when subsequent Node security releases ship.
FROM node:22.23.4-alpine
# Node uses its bundled CA store by default (updated by the runtime pin).
# Refresh Alpine's separate store for OpenSSL and other system clients too.
RUN apk add --no-cache --upgrade ca-certificates \
    && update-ca-certificates
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:host

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# Schema creation, admin account, and backup restore all happen inside the
# server at boot (instrumentation.ts → lib/bootstrap-db.ts) — idempotent.
CMD ["npm", "start"]
