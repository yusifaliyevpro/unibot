#!/bin/bash

# === Configuration ===
REPO_SSH="git@github.com:yusifaliyevpro/unibot.git" # Replace with your actual repo SSH URL
APP_DIR="unibot"
CONTAINER_NAME="unibot-container"
IMAGE_NAME="unibot"
PORT="3000"
ENV_FILE="$HOME/unibot-env/.env"

echo "🧹 Removing previous project directory if it exists..."
rm -rf $APP_DIR

echo "📥 Cloning the repository again..."
git clone --depth=1 $REPO_SSH
cd $APP_DIR || { echo "❌ Failed to enter the project directory!"; exit 1; }

echo "🔧 Fixing line endings..."
find cmd -name "*.sh" -exec sed -i 's/\r//' {} \;

echo "🐳 Building the Docker image..."
<<<<<<< HEAD
docker build -t $IMAGE_NAME:latest .
=======
docker build --secret id=envfile,src=$ENV_FILE -t $IMAGE_NAME:latest .
>>>>>>> 35a2a40 (Refactor deployment script and Dockerfile for improved build process)

echo "🛑 Stopping and removing any existing container..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "🚀 Running the new Docker container..."
docker run -d --name $CONTAINER_NAME -p $PORT:$PORT --env-file $ENV_FILE $IMAGE_NAME:latest

echo "🧹 Cleaning up unused Docker build cache and resources..."
docker builder prune -f
docker image prune -f

echo "📡 Showing container logs (press CTRL+C to exit)..."
docker logs -f $CONTAINER_NAME
