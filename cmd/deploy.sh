#!/bin/bash

# === Configuration ===
REPO_URL="https://github.com/yusifaliyevpro/unibot.git"
APP_DIR="unibot"
CONTAINER_NAME="unibot-container"
IMAGE_NAME="unibot"
PORT="3000"
ENV_FILE="$HOME/unibot-env/.env"

echo "🧹 Removing previous project directory if it exists..."
rm -rf $APP_DIR

echo "📥 Cloning the repository again..."
git clone --depth=1 $REPO_URL
cd $APP_DIR || { echo "❌ Failed to enter the project directory!"; exit 1; }

echo "🔧 Fixing line endings..."
find cmd -name "*.sh" -exec sed -i 's/\r//' {} \;

echo "🔧 Fixing .env file for Docker compatibility..."
bash cmd/fix-env.sh $ENV_FILE

echo "🐳 Building the Docker image..."
docker build --secret id=envfile,src=$ENV_FILE -t $IMAGE_NAME:latest .

echo "🛑 Stopping and removing any existing container..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "🚀 Running the new Docker container..."
docker run -d --name $CONTAINER_NAME -p $PORT:$PORT --env-file $ENV_FILE $IMAGE_NAME:latest

echo "🧹 Optional: cleaning up dangling images only (keeps cache)..."
docker image prune -f --filter "dangling=true"


echo "📡 Showing container logs (press CTRL+C to exit)..."
docker logs -f $CONTAINER_NAME
