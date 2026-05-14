#!/bin/bash

# Automated Odds Backfill Runner
# Usage: ./run_backfill.sh OR ./run_backfill.sh YOUR_API_KEY

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Get API key from argument or environment
API_KEY="${1:-${ODDS_API_KEY}}"

if [ -z "$API_KEY" ]; then
  # Try to load from .env file
  if [ -f ".env" ]; then
    source .env
    API_KEY="${ODDS_API_KEY}"
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "❌ Error: No API key provided"
  echo ""
  echo "Usage:"
  echo "  ./run_backfill.sh YOUR_API_KEY"
  echo "  OR"
  echo "  export ODDS_API_KEY=YOUR_API_KEY && ./run_backfill.sh"
  echo "  OR"
  echo "  echo 'ODDS_API_KEY=YOUR_KEY' > .env && ./run_backfill.sh"
  exit 1
fi

echo "🎯 Starting Odds Backfill"
echo "📅 Time: $(date)"
echo "📂 Directory: $PROJECT_DIR"
echo "🔑 API Key: ${API_KEY:0:8}..."
echo "---"

# Run with 8-hour timeout (28800 seconds)
timeout 28800 node backfill_historical_odds.js "$API_KEY"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo ""
  echo "⏱️  8-hour timeout reached - script will resume next run"
  exit 0
elif [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Script failed with exit code: $EXIT_CODE"
  exit $EXIT_CODE
else
  echo ""
  echo "✅ Script completed successfully"
  exit 0
fi
