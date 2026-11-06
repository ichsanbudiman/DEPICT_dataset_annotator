# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /src
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    mkdir -p /app/data && chown 1001:1001 /app/data

COPY --from=deps --chown=1001:1001 /src/node_modules ./node_modules
COPY --link --chown=1001:1001 package.json package-lock.json ./
COPY --link --chown=1001:1001 server ./server
COPY --link --chown=1001:1001 public ./public
COPY --link --chown=1001:1001 scripts ./scripts

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/app/data/desk.db

USER 1001:1001
EXPOSE 8080

LABEL org.opencontainers.image.title="depict-annotation-desk" \
      org.opencontainers.image.description="Self-hosted DEPICT annotation desk"

ENTRYPOINT ["node", "server/index.js"]
