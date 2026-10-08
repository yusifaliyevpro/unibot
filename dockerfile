# syntax=docker/dockerfile:1
FROM ghcr.io/pnpm/pnpm:12

RUN pnpm runtime set node 26 -g

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Store lives outside /pnpm/store so the mount doesn't hide the Node runtime
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile

COPY . .

RUN --mount=type=secret,id=envfile,target=/app/.env pnpm build

EXPOSE 3000
CMD ["node", "dist/main"]
