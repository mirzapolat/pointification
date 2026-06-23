# syntax=docker/dockerfile:1

# ---- Build stage: compile the Vite SPA ----------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (incl. dev) for the build.
COPY package.json package-lock.json ./
RUN npm ci

# Supabase config is inlined into the bundle at build time, so it must be
# available as build args. Donate URL is optional.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DONATE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_DONATE_URL=$VITE_DONATE_URL

COPY . .
RUN npm run build

# ---- Runtime stage: serve dist via the Node server ----------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Only production deps are needed to run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
