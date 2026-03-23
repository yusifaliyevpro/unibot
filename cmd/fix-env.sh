#!/bin/bash

# Fixes .env file for Docker compatibility:
# - Collapses multi-line JSON values into a single line
# - Removes surrounding quotes from JSON values if present

ENV_FILE="${1:-$HOME/unibot-env/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found at: $ENV_FILE"
  exit 1
fi

echo "🔧 Fixing $ENV_FILE ..."

python3 - "$ENV_FILE" <<'EOF'
import sys
import json
import re

path = sys.argv[1]

with open(path, "r") as f:
    content = f.read()

lines = content.splitlines()
result = []
i = 0

while i < len(lines):
    line = lines[i]

    # Skip empty lines and comments
    if not line.strip() or line.strip().startswith("#"):
        result.append(line)
        i += 1
        continue

    if "=" not in line:
        result.append(line)
        i += 1
        continue

    key, _, value = line.partition("=")
    value = value.strip()

    # Detect start of a multi-line JSON value
    if value in ("{", "[") or (value.startswith(("{", "[")) and value.count("{") != value.count("}")) :
        collected = value
        depth = collected.count("{") + collected.count("[") - collected.count("}") - collected.count("]")
        i += 1
        while i < len(lines) and depth > 0:
            next_line = lines[i].strip()
            collected += " " + next_line
            depth += next_line.count("{") + next_line.count("[")
            depth -= next_line.count("}") + next_line.count("]")
            i += 1
        # Minify the JSON
        try:
            minified = json.dumps(json.loads(collected), separators=(",", ":"))
        except json.JSONDecodeError:
            minified = collected  # leave as-is if not valid JSON
        result.append(f"{key}={minified}")
    else:
        result.append(line)
        i += 1

with open(path, "w") as f:
    f.write("\n".join(result) + "\n")

print("✅ Done.")
EOF
