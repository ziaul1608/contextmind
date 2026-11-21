# ==============================================================================
# Production Dockerfile for ContextMind Backend
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root & workspace package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all monorepo dependencies
RUN npm ci

# Copy sources for shared and server
COPY tsconfig.json ./
COPY shared/ ./shared/
COPY server/ ./server/

# Build shared package then server package
RUN npm run build --workspace=shared
RUN npm run build --workspace=server

# ==============================================================================
# Runner Image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy workspace package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY shared/dist ./shared/dist
COPY server/package.json ./server/
COPY server/dist ./server/dist
COPY server/prisma ./server/prisma

# Install production dependencies only and generate Prisma Client
RUN npm ci --omit=dev && cd server && npx prisma generate

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

# Automatically deploy Prisma migrations then start the server
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node dist/index.js"]
