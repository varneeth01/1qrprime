FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci

FROM deps AS api-build
COPY apps/api apps/api
COPY scripts scripts
RUN npm run build -w apps/api

FROM node:22-bookworm-slim AS api-runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY --from=api-build /app/apps/api/dist apps/api/dist
COPY --from=api-build /app/apps/api/migrations apps/api/migrations
COPY --from=api-build /app/scripts scripts
RUN mkdir -p /data/media && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["sh","-c","node scripts/postgres-migrate.mjs && node apps/api/dist/server.js"]

FROM deps AS web-build
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine AS web-runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
