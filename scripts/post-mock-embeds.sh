#!/bin/bash
# Posts mock agent status embeds to a Discord channel for WeYell testing.
# Usage: ./scripts/post-mock-embeds.sh <bot_token> <channel_id>
# Requires: curl, jq

BOT_TOKEN="${1:-$DISCORD_BOT_TOKEN}"
CHANNEL_ID="${2:-$DISCORD_CHANNEL_ID}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHANNEL_ID" ]; then
  echo "Usage: post-mock-embeds.sh <bot_token> <channel_id>"
  echo "  or set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID env vars"
  exit 1
fi

API="https://discord.com/api/v10"
HEADERS=(-H "Authorization: Bot $BOT_TOKEN" -H "Content-Type: application/json")

# Clear the channel first (delete recent bot messages)
echo "Clearing channel..."
MESSAGES=$(curl -s "${HEADERS[@]}" "$API/channels/$CHANNEL_ID/messages?limit=20")
echo "$MESSAGES" | jq -r '.[] | select(.author.bot == true) | .id' | while read msgid; do
  curl -s -X DELETE "${HEADERS[@]}" "$API/channels/$CHANNEL_ID/messages/$msgid" > /dev/null
done

# Post 5 agent status embeds
echo "Posting agent embeds..."

post_agent() {
  local title="$1" role="$2" state="$3" color="$4" activity="$5" tool="$6"
  curl -s -X POST "${HEADERS[@]}" "$API/channels/$CHANNEL_ID/messages" \
    -d "{
      \"embeds\": [{
        \"title\": \"$title\",
        \"description\": \"$activity\",
        \"color\": $color,
        \"footer\": { \"text\": \"$tool\" },
        \"fields\": [
          { \"name\": \"role\", \"value\": \"$role\", \"inline\": true },
          { \"name\": \"state\", \"value\": \"$state\", \"inline\": true }
        ]
      }]
    }" > /dev/null
}

# Agent color hex values
GREEN=6135258      # 0x5ddf9a = WORKING
YELLOW=16767334    # 0xffd166 = THINKING
BLUE=7058943       # 0x6bb6ff = WAITING
RED=16746347       # 0xff6b6b = ERROR
GRAY=9147303       # 0x8b93a7 = IDLE

post_agent "Hermes" "Orchestrator" "WORKING" "$GREEN" "Dispatching tasks to Apollo and Athena" "kanban_create"
sleep 0.5
post_agent "Apollo" "Code Writer" "WORKING" "$GREEN" "Writing auth middleware for API v2" "Write"
sleep 0.5
post_agent "Athena" "Researcher" "THINKING" "$YELLOW" "Analyzing search results for rate limiting patterns" ""
sleep 0.5
post_agent "Iris" "Reviewer" "WAITING" "$BLUE" "Waiting for Apollo to finish PR #142" ""
sleep 0.5
post_agent "Argos" "Test Runner" "IDLE" "$GRAY" "Waiting for work" ""

echo "Done! 5 agents posted to channel $CHANNEL_ID"
echo "Run WeYell with: DEMO_MODE=false DISCORD_BOT_TOKEN=... DISCORD_CHANNEL_ID=... node server.js"
