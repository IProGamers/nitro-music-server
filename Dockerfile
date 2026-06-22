# Run on NODE, not Bun. Bun's TLS on this image can't verify Google Trust Services
# certs, which breaks youtubei.js + the googlevideo audio proxy ("unknown
# certificate verification error") while jiosaavn works. Node's TLS handles Google
# fine and youtubei.js is natively supported on Node.

FROM node:20-slim AS base
WORKDIR /app
COPY package.json ./
# Prisma schema must exist before install (postinstall runs `prisma generate`).
COPY prisma ./prisma
# Full install (NOT --omit=dev): the `prisma` CLI is a devDependency the
# postinstall needs. package-lock is stale, so `install` (not `ci`).
RUN npm install

FROM base AS build
WORKDIR /app
COPY . .
# Compile TS -> dist (tsc-alias rewrites the path aliases).
RUN npx tsc && npx tsc-alias

FROM node:20-slim AS production
WORKDIR /app

# yt-dlp powers YouTube audio streaming (android/ios player_client → unthrottled,
# seekable URLs). Latest from pip so the extractor stays current.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates openssl \
    && python3 -m pip install --no-cache-dir --break-system-packages -U yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/prisma ./prisma
# Persistent warm yt-dlp resolver (talked to over stdio by the YouTube module)
COPY ytdlp_resolver.py ./ytdlp_resolver.py

# Prisma reads DATABASE_URL when the client is constructed at startup (history is
# stored in Firestore client-side, so this DB isn't actually queried).
ENV DATABASE_URL="file:./dev.db"
# Node already trusts Google's CA; this is just belt-and-suspenders.
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
# CRITICAL: the HF container has broken IPv6 egress. Google/YouTube hosts have
# AAAA records, so Node tries IPv6 first and the socket resets before TLS
# ("ECONNRESET ... before secure TLS connection was established"). jiosaavn is
# reachable over IPv4 so it works. Force IPv4-first to fix youtubei.js.
ENV NODE_OPTIONS=--dns-result-order=ipv4first

EXPOSE 3000

CMD ["node", "dist/node-server.js"]
