FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json

RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p public
RUN npm run build

FROM node:22-bookworm-slim AS node

FROM container-registry.oracle.com/os/oraclelinux:10-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/home/nextjs \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PATH=/usr/local/bin:$PATH

RUN if command -v microdnf >/dev/null 2>&1; then \
      PKG_MGR=microdnf; \
    else \
      PKG_MGR=dnf; \
    fi && \
    "$PKG_MGR" install -y \
      ca-certificates \
      libstdc++ \
      shadow-utils && \
    "$PKG_MGR" clean all && \
    groupadd --system --gid 1001 nodejs && \
    useradd --system --create-home --home-dir /home/nextjs --uid 1001 --gid 1001 nextjs && \
    mkdir -p /home/nextjs && \
    chown -R nextjs:nodejs /home/nextjs

COPY --from=node /usr/local /usr/local
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/config ./config
COPY scripts/container-entrypoint.sh ./container-entrypoint.sh

RUN chmod +x ./container-entrypoint.sh

USER nextjs

EXPOSE 3000

CMD ["./container-entrypoint.sh"]
