# Production Multi-Stage Dockerfile for RentMe V1 Marketplace
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies for TypeScript compilation
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript and copy schema
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

# Create non-root user for container security
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 rentme -G nodejs

# Copy package manifests and install production-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Set ownership to non-root user
RUN chown -R rentme:nodejs /app

USER rentme

EXPOSE 5173

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node scripts/health-check.js || exit 1

CMD ["node", "server.js"]
