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

# Production
FROM oven/bun:alpine AS production

WORKDIR /user/app

# yt-dlp powers YouTube audio streaming (android/ios player_client → unthrottled,
# seekable URLs). Install the LATEST from pip (not the Alpine package, which lags)
# so the extractor stays current against YouTube changes for as long as possible.
RUN apk add --no-cache python3 py3-pip ca-certificates \
    && pip install --no-cache-dir --break-system-packages -U yt-dlp

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

EXPOSE 3000

CMD ["bun", "run", "start"]
