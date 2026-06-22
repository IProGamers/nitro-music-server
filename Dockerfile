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

# Bun's built-in CA bundle can't verify Google Trust Services certs (so youtubei.js
# + the googlevideo audio proxy fail with "unknown certificate verification error",
# while jiosaavn's CA — already in Bun's bundle — works). Point Bun at the full
# Debian system CA bundle (installed via ca-certificates above), which DOES include
# the Google roots. Keep REJECT_UNAUTHORIZED=0 as a belt-and-suspenders fallback.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

EXPOSE 3000

CMD ["bun", "run", "start"]

# build trigger: per-request TLS bypass + Debian runtime
