FROM node:24-slim

RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    fonts-liberation \
    xdg-utils \
    libgbm-dev \
    libxshmfence-dev \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*


RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpx puppeteer browsers install chrome

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/main"]
