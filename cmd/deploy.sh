#!/bin/bash

# === Configuration ===
APP_DIR="$HOME/unibot"
BRANCH="main"
CONTAINER_NAME="unibot-container"
IMAGE_NAME="unibot"
PORT="3000"
ENV_FILE="$APP_DIR/.env"

# Wrapped in a function so bash reads the whole script before git rewrites this file
main() {
  set -e
  cd "$APP_DIR" || { echo "❌ Project directory not found: $APP_DIR"; exit 1; }
  [ -f "$ENV_FILE" ] || { echo "❌ .env file not found at: $ENV_FILE"; exit 1; }

  echo "🔄 Syncing with origin/$BRANCH..."
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
  # Removes untracked files, keeps ignored ones like .env
  git clean -fd

  echo "🐳 Building the Docker image..."
  docker build --secret id=envfile,src="$ENV_FILE" -t "$IMAGE_NAME:latest" .

  echo "🛑 Stopping and removing any existing container..."
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true

  echo "🚀 Running the new Docker container..."
  docker run -d --name "$CONTAINER_NAME" -p "$PORT:$PORT" --env-file "$ENV_FILE" "$IMAGE_NAME:latest"

  echo "🧹 Cleaning up dangling images only (keeps cache)..."
  docker image prune -f --filter "dangling=true"

  echo "📡 Showing container logs (press CTRL+C to exit)..."
  docker logs -f "$CONTAINER_NAME"
}

main "$@"
exit
