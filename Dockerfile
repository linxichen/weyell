# --- Stage 1: build frontend with Vite ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY vite.config.mjs ./
COPY public ./public
ARG VITE_DISCORD_CLIENT_ID=""
ENV VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}
RUN npm run build

# --- Stage 2: production node_modules only ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# --- Stage 3: runtime ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json server.js ./
EXPOSE 3333
CMD ["node", "server.js"]
