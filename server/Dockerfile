FROM node:20-alpine

WORKDIR /app

# Copy just the package manifests first so `npm install` is cached as its
# own Docker layer and doesn't re-run every time source code changes.
# This is an npm workspaces monorepo, so the root manifest plus every
# workspace's manifest are needed before install will resolve correctly.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY shared/package.json shared/package.json

RUN npm install

# Now bring in the actual source.
COPY server server
COPY shared shared

WORKDIR /app/server

EXPOSE 4000

# On every container start: wait for MySQL to accept connections, apply
# schema.sql + all migrations (safe to re-run, they're idempotent), seed
# sample data unless AUTO_SEED=false, then start the API with hot-reload.
CMD ["sh", "-c", "node scripts/wait-for-db.js && node scripts/migrate.js && ([ \"$AUTO_SEED\" = \"false\" ] || node scripts/seed.js) && npm run dev"]
