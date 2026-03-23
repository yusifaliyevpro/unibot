
#!/bin/bash


# === Configuration ===
CONTAINER_NAME="unibot-container"

echo "🛑 Stopping unibot-container..."
docker stop $CONTAINER_NAME 2>/dev/null || true
