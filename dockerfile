# syntax=docker/dockerfile:1
FROM node:24-slim

# Install Chromium/Puppeteer dependencies for Ubuntu 24.04 (Noble)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxshmfence1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@latest

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Install Chrome before copying source — cached unless deps change
RUN pnpx puppeteer browsers install chrome

COPY . .

RUN --mount=type=secret,id=envfile,target=/app/.env pnpm build

EXPOSE 3000
CMD ["node", "dist/main"]