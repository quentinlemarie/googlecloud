# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cache friendly)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config for SPA (all routes → index.html)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Cloud Run injects $PORT (default 8080); expose the standard value
ENV PORT=8080
EXPOSE 8080

# envsubst replaces ${PORT} in the template, then starts nginx
CMD ["/bin/sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
