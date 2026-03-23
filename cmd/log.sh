
#!/bin/bash


# === Configuration ===
CONTAINER_NAME="unibot-container"

echo "📡 Showing container logs (press CTRL+C to exit)..."
docker logs -f $CONTAINER_NAME