FROM oven/bun AS base

WORKDIR /user/app

COPY package.json .

COPY bun.lockb .

RUN bun install --frozen-lockfile --production

# Making build file
FROM base AS build

WORKDIR /user/app

COPY . .

RUN bun install --frozen-lockfile

RUN bun run build

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
# Persistent warm yt-dlp resolver (talked to over stdio by the YouTube module)
COPY ytdlp_resolver.py ./ytdlp_resolver.py

EXPOSE 3000

CMD ["bun", "run", "start"]
