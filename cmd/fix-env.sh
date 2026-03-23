#!/bin/bash

# Fixes .env file for Docker compatibility:
# - Strips surrounding quotes from all values (Docker --env-file doesn't strip them)
# - Collapses multi-line JSON values into a single minified line

ENV_FILE="${1:-$HOME/unibot-env/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found at: $ENV_FILE"
  exit 1
fi

echo "🔧 Fixing $ENV_FILE ..."

python3 - "$ENV_FILE" <<'EOF'
import sys
import json

path = sys.argv[1]

with open(path, "r") as f:
    content = f.read()

lines = content.splitlines()
result = []
i = 0

while i < len(lines):
    line = lines[i]

    # Preserve empty lines and comments
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

    # Collect multi-line values (e.g. JSON spanning multiple lines)
    depth = value.count("{") + value.count("[") - value.count("}") - value.count("]")
    while depth > 0 and i + 1 < len(lines):
        i += 1
        next_line = lines[i].strip()
        value += " " + next_line
        depth += next_line.count("{") + next_line.count("[")
        depth -= next_line.count("}") + next_line.count("]")

    # Strip surrounding single or double quotes
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]

    # If value looks like JSON, minify it
    if value.startswith(("{", "[")):
        try:
            value = json.dumps(json.loads(value), separators=(",", ":"))
        except json.JSONDecodeError:
            pass  # leave as-is if not valid JSON

    result.append(f"{key}={value}")
    i += 1

with open(path, "w") as f:
    f.write("\n".join(result) + "\n")

print("✅ Done.")
EOF
