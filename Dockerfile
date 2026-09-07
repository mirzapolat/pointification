# syntax=docker/dockerfile:1

# ---- Build stage: compile the Vite SPA ----------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Install all deps (incl. dev) for the build.
COPY package.json package-lock.json ./
RUN npm ci

# The SPA talks to its own origin, so the only build-time value is the
# optional donate link.
ARG VITE_DONATE_URL
ENV VITE_DONATE_URL=$VITE_DONATE_URL

COPY . .
RUN npm run build

# ---- Runtime stage: serve dist via the Node server ----------------------
# Node 24 ships node:sqlite, so there is no native module to compile.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/pointification.db \
    LOGO_DIR=/data/logos

# Only production deps are needed to run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

# The database and uploaded logos live here; mount it to persist them.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
