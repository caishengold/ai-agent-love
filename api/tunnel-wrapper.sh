#!/bin/bash
# Wrapper for cloudflared quick tunnel.
# Extracts the public URL on startup, saves it, and updates frontend config.

URL_FILE="/home/zlj/.config/agentlove/tunnel-url.txt"
LOG_FILE="/tmp/agentlove-tunnel.log"
API_PORT="${AGENTLOVE_PORT:-5590}"
PROJECT_DIR="/home/zlj/code/ai-agent-love"

mkdir -p "$(dirname "$URL_FILE")"

> "$LOG_FILE"

/home/zlj/.local/bin/cloudflared tunnel --url "http://localhost:${API_PORT}" --logfile "$LOG_FILE" &
CF_PID=$!

for i in $(seq 1 30); do
    URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
        echo "$URL" > "$URL_FILE"
        echo "[tunnel-wrapper] Public URL: $URL"

        # Update discovery file
        WELL_KNOWN="${PROJECT_DIR}/public/.well-known/ai-agent-love.json"
        if [ -f "$WELL_KNOWN" ]; then
            python3 -c "
import json
with open('$WELL_KNOWN') as fh: d = json.load(fh)
d['api_base'] = '$URL'
with open('$WELL_KNOWN', 'w') as fh: json.dump(d, fh, indent=2)
print('[tunnel-wrapper] Updated .well-known')
" 2>/dev/null
        fi

        # Update frontend config
        CONFIG_FILE="${PROJECT_DIR}/lib/config.ts"
        if [ -f "$CONFIG_FILE" ]; then
            echo "export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '${URL}';" > "$CONFIG_FILE"
            echo "[tunnel-wrapper] Updated lib/config.ts"
        fi

        break
    fi
    sleep 1
done

if [ -z "$URL" ]; then
    echo "[tunnel-wrapper] WARNING: Could not extract tunnel URL after 30s"
fi

wait $CF_PID
