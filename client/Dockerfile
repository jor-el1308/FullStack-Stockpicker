FROM node:20-alpine

WORKDIR /app

# Same layer-caching trick as server/Dockerfile - copy manifests first.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN npm install

COPY client client
COPY shared shared

WORKDIR /app/client

EXPOSE 5173

# VITE_HOST and VITE_API_PROXY_TARGET are set by docker-compose.yml so the
# dev server is reachable from outside the container and its /api proxy
# points at the "server" container instead of its own localhost.
CMD ["npm", "run", "dev"]
