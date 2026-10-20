# Dockerfile - POS DIAN Tactical Ops System
FROM node:22-alpine AS base

# Puppeteer usa el Chromium del sistema (instalado en el runner), no el bundle
# descargado en build. Evita descargas frágiles dentro de Alpine.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci || npm i

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrador y node_modules completo para aplicar Drizzle al arrancar.
# (El standalone no incluye tsx, necesario por scripts/db-migrate.ts.)
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/db-migrate.ts ./scripts/db-migrate.ts
COPY --from=builder /app/lib/db/migrate.ts ./lib/db/migrate.ts
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/tsx scripts/db-migrate.ts && node server.js"]
