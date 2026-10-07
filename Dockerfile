FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build
ENV NODE_ENV=production
WORKDIR /app/apps/api
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
CMD ["node","dist/server.js"]
