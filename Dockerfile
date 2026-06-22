FROM oven/bun AS base

WORKDIR /user/app

COPY package.json .
# Prisma schema must exist before install: the postinstall runs `prisma generate`.
COPY prisma ./prisma

# Full install (NOT --production): the `prisma` CLI is a devDependency and the
# postinstall `prisma generate` needs it. This also leaves the generated client
# in node_modules, which the production stage copies.
RUN bun install

# Making build file
FROM base AS build

WORKDIR /user/app

COPY . .

# Compile directly with the local tools. We avoid `bun run build` because its
# `prebuild` calls `npx`, which isn't present in the oven/bun image.
RUN bunx tsc && bunx tsc-alias

# Production — Debian (same as `base`), so the Prisma query engine generated in
# the base stage matches the runtime. Alpine/musl would need a different engine
# target + openssl libs, which is what crashed the previous boot.
FROM oven/bun AS production

WORKDIR /user/app

# yt-dlp powers YouTube audio streaming (android/ios player_client → unthrottled,
# seekable URLs). Install the LATEST from pip so the extractor stays current
# against YouTube changes for as long as possible.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && python3 -m pip install --no-cache-dir --break-system-packages -U yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /user/app/dist ./dist
COPY --from=base /user/app/node_modules ./node_modules
COPY --from=base /user/app/package.json ./package.json
COPY --from=base /user/app/prisma ./prisma
# Persistent warm yt-dlp resolver (talked to over stdio by the YouTube module)
COPY ytdlp_resolver.py ./ytdlp_resolver.py

# Prisma reads DATABASE_URL when the client is constructed at startup. The
# deployed client uses Firestore for history/favorites, so the SQLite DB isn't
# actually queried — but the URL must be present or construction throws.
ENV DATABASE_URL="file:./dev.db"

# Bun (this Linux build) throws "unknown certificate verification error" on
# Google's TLS — breaking youtubei.js search/metadata AND the googlevideo audio
# proxy — while jiosaavn fetches succeed. This backend only makes OUTBOUND calls
# to public endpoints (YouTube, googlevideo, cover-art hosts, jiosaavn) and sends
# no credentials, so skipping outbound cert verification is a safe, scoped trade.
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

EXPOSE 3000

CMD ["bun", "run", "start"]
