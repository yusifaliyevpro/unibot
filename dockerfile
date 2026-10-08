# syntax=docker/dockerfile:1
FROM node:26-slim

RUN npm install -g pnpm@latest

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN --mount=type=secret,id=envfile,target=/app/.env pnpm build

EXPOSE 3000
CMD ["node", "dist/main"]