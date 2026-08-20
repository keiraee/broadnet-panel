# syntax=docker/dockerfile:1

FROM node:22-bookworm AS web-build
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.51.0-jammy
WORKDIR /app

ENV NODE_ENV=production \
    PORT=9993 \
    HEADLESS=1 \
    BROWSER_PROFILE=/data/browser-profile \
    KEEPALIVE_MS=600000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/browser ./browser
COPY server/lib ./lib
COPY server/index.js ./
COPY --from=web-build /src/web/dist ./public

RUN mkdir -p /data/browser-profile \
  && chown -R pwuser:pwuser /app /data

EXPOSE 9993
VOLUME ["/data/browser-profile"]

USER pwuser
CMD ["node", "index.js"]
