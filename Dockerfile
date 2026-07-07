# Universal fallback: runs the exact same app on any Docker/Node host.
FROM node:22-alpine
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
