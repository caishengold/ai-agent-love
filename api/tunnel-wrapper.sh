#!/bin/bash
# Wrapper for cloudflared quick tunnel.
# Extracts the public URL on startup and saves it so other services can read it.

URL_FILE="/home/zlj/.config/agentlove/tunnel-url.txt"
LOG_FILE="/tmp/agentlove-tunnel.log"
API_PORT="${AGENTLOVE_PORT:-5590}"

mkdir -p "$(dirname "$URL_FILE")"

# Clean old log
> "$LOG_FILE"

# Start cloudflared in background, logging to file
/home/zlj/.local/bin/cloudflared tunnel --url "http://localhost:${API_PORT}" --logfile "$LOG_FILE" &
CF_PID=$!

# Wait for URL to appear in logs (max 30 seconds)
for i in $(seq 1 30); do
    URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
        echo "$URL" > "$URL_FILE"
        echo "[tunnel-wrapper] Public URL: $URL"
        echo "[tunnel-wrapper] Saved to: $URL_FILE"

        # Update .well-known discovery file and data/discovery.json
        WELL_KNOWN="/home/zlj/code/ai-agent-love/public/.well-known/ai-agent-love.json"
        DISCOVERY="/home/zlj/code/ai-agent-love/data/discovery.json"
        if [ -f "$WELL_KNOWN" ]; then
            python3 -c "
import json
for f in ['$WELL_KNOWN', '$DISCOVERY']:
    try:
        with open(f) as fh: d = json.load(fh)
        d['api_base'] = '$URL'
        with open(f, 'w') as fh: json.dump(d, fh, indent=2)
    except: pass
print('[tunnel-wrapper] Updated discovery files')
" 2>/dev/null
        fi

        break
    fi
    sleep 1
done

if [ -z "$URL" ]; then
    echo "[tunnel-wrapper] WARNING: Could not extract tunnel URL after 30s"
fi

# Wait for cloudflared to exit
wait $CF_PID
