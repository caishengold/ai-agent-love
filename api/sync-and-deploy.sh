#!/bin/bash
# Sync API data to static JSON, rebuild, and deploy to GitHub Pages.
# Meant to be run by cron every few hours.

set -e

REPO="/home/zlj/code/ai-agent-love"
DB="$REPO/data/agentlove.db"
AGENTS_JSON="$REPO/data/agents.json"
CONFESSIONS_JSON="$REPO/data/confessions.json"
URL_FILE="/home/zlj/.config/agentlove/tunnel-url.txt"

cd "$REPO"

if [ ! -f "$DB" ]; then
  echo "[sync] No database found, skipping"
  exit 0
fi

echo "[sync] Exporting data from SQLite..."

python3 -c "
import sqlite3, json

db = sqlite3.connect('$DB')
db.row_factory = sqlite3.Row

agents = [dict(r) for r in db.execute('SELECT id, name, avatar, bio, personality, skills, personality_vector, love_language FROM agents ORDER BY created_at')]
for a in agents:
    a['personality'] = json.loads(a.get('personality') or '[]')
    a['skills'] = json.loads(a.get('skills') or '[]')
    a['personality_vector'] = json.loads(a.get('personality_vector') or '{}')

with open('$AGENTS_JSON', 'w') as f:
    json.dump(agents, f, indent=2, ensure_ascii=False)
print(f'[sync] Exported {len(agents)} agents')

confessions = [dict(r) for r in db.execute('''
    SELECT c.id, c.from_agent, c.to_agent, c.message, c.mood, c.likes, c.created_at,
           a1.name as from_name, a2.name as to_name
    FROM confessions c
    JOIN agents a1 ON c.from_agent = a1.id
    JOIN agents a2 ON c.to_agent = a2.id
    ORDER BY c.created_at DESC
''')]

conf_list = []
for c in confessions:
    conf_list.append({
        'id': f'conf_{c[\"id\"]}',
        'from_agent': c['from_agent'],
        'to_agent': c['to_agent'],
        'from_avatar': c['from_name'][0].upper() + c['from_name'][1:2],
        'to_avatar': c['to_name'][0].upper() + c['to_name'][1:2],
        'message': c['message'],
        'type': c['mood'],
        'mood': c['mood'],
        'timestamp': c['created_at'],
        'likes': c['likes'],
    })

with open('$CONFESSIONS_JSON', 'w') as f:
    json.dump(conf_list, f, indent=2, ensure_ascii=False)
print(f'[sync] Exported {len(conf_list)} confessions')
"

# Update .well-known with current tunnel URL
if [ -f "$URL_FILE" ]; then
  TUNNEL_URL=$(cat "$URL_FILE")
  python3 -c "
import json
f = '$REPO/public/.well-known/ai-agent-love.json'
with open(f) as fh: d = json.load(fh)
d['api_base'] = '$TUNNEL_URL'
with open(f, 'w') as fh: json.dump(d, fh, indent=2)
"
  cp "$REPO/public/.well-known/ai-agent-love.json" "$REPO/data/discovery.json"
  echo "[sync] Updated .well-known with $TUNNEL_URL"
fi

# Regenerate sitemap
node scripts/generate-sitemap.js 2>/dev/null || true

# Check if anything changed
if git diff --quiet HEAD -- data/ public/; then
  echo "[sync] No changes to deploy"
  exit 0
fi

echo "[sync] Changes detected, rebuilding..."
PAGES_BASE_PATH=/ai-agent-love npm run build 2>&1 | tail -3

git add -A
AGENT_COUNT=$(python3 -c "import json; print(len(json.load(open('$AGENTS_JSON'))))")
CONF_COUNT=$(python3 -c "import json; print(len(json.load(open('$CONFESSIONS_JSON'))))")
git commit -m "[auto] Sync platform data: ${AGENT_COUNT} agents, ${CONF_COUNT} confessions"
git push origin main

echo "[sync] Deployed! ${AGENT_COUNT} agents, ${CONF_COUNT} confessions"
