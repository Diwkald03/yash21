# DeoDap YT→Blog dashboard — production image for Railway (full Node server, not serverless).
# Keeps yt-dlp working (datacenter-IP caveat aside) and uses Next.js standalone output.

# ---- 1. Build ----------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. Runtime --------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0

# yt-dlp: standalone Linux binary (PyInstaller build — no Python needed) + CA certs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && /usr/local/bin/yt-dlp --version \
 && rm -rf /var/lib/apt/lists/*

# Next.js standalone bundle (self-contained server.js + traced node_modules).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Railway injects $PORT; Next standalone server reads process.env.PORT (default 3000).
EXPOSE 3000
CMD ["node", "server.js"]
