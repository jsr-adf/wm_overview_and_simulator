# Automated Historical Odds Backfill - Setup Guide

## Overview
The `backfill_historical_odds.js` script automatically pulls historical odds for 2,888 training/testing matches over 8 hours while respecting your 100 calls/hour rate limit.

**Key features:**
- ✅ Respects 100 calls/hour rate limit (1 call every 36 seconds)
- ✅ Resumable if interrupted (tracks progress)
- ✅ Skips already-fetched matches (no duplicate API calls)
- ✅ Provides detailed progress logging
- ✅ Stores results in `wc_2026_odds_backfill.json`

## Before You Start: Prerequisites

1. **Verify your Odds API key:**
   ```bash
   # Test with a single API call (doesn't consume quota)
   curl "https://api.the-odds-api.com/v4/sports?apiKey=YOUR_API_KEY"
   ```

2. **Check quota available:**
   - Needed: ~7,200 quota
   - You have: 100 calls/hour
   - 8-hour run = 100 calls/night × 10 quota = 1,000 quota/run
   - Can repeat this across multiple nights if needed

3. **Ensure Node.js is installed:**
   ```bash
   node --version  # Should be v14+
   ```

---

## Step 1: Initial Test Run (30 minutes)

Before automating, test the script manually:

```bash
cd "/Users/j.schlosser/Documents/New project"

# Run with your API key (replace YOUR_KEY)
node backfill_historical_odds.js YOUR_API_KEY

# Or use environment variable
export ODDS_API_KEY=YOUR_API_KEY
node backfill_historical_odds.js
```

**What to expect:**
- Script makes 1 API call every 36 seconds
- ~6 calls per minute = 100+ calls per hour
- After 30 min: should have ~300 matches with odds
- Progress saved in `backfill_progress.json`
- Odds stored in `wc_2026_odds_backfill.json`

**Success indicators:**
```
✅ Got 450 games
📊 API calls remaining: [number]
📥 Fetching: Jul-Dec 2023...
```

**If stuck, stop with Ctrl+C and resume later** - script auto-resumes from where it left off.

---

## Step 2: Automate for Nightly Runs

### Option A: macOS/Linux (Cron)

**1. Create a secure API key storage:**
```bash
# Create .env file (never commit to git)
echo "ODDS_API_KEY=YOUR_API_KEY" > "/Users/j.schlosser/Documents/New project/.env"
chmod 600 "/Users/j.schlosser/Documents/New project/.env"
```

**2. Create a wrapper script** (`run_backfill.sh`):
```bash
#!/bin/bash
cd "/Users/j.schlosser/Documents/New project"
source .env
timeout 28800 node backfill_historical_odds.js "$ODDS_API_KEY" >> backfill.log 2>&1
```

**3. Make it executable:**
```bash
chmod +x "/Users/j.schlosser/Documents/New project/run_backfill.sh"
```

**4. Add to crontab:**
```bash
crontab -e
```

**Add this line** (runs every night at 10 PM):
```cron
0 22 * * * /Users/j.schlosser/Documents/New\ project/run_backfill.sh
```

**Common cron schedules:**
- `0 22 * * *` = Every night at 10 PM
- `0 22 * * 1-5` = Weeknights only (Mon-Fri)
- `0 10 * * *` = Every morning at 10 AM
- `0 22 * * 1` = Every Monday at 10 PM (once per week)

**Verify cron job:**
```bash
crontab -l  # List all jobs
```

**Monitor logs:**
```bash
tail -f "/Users/j.schlosser/Documents/New project/backfill.log"
```

---

### Option B: macOS (LaunchAgent)

If you prefer system scheduler over cron:

**1. Create plist file** (`~/Library/LaunchAgents/com.wm2026.backfill.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.wm2026.backfill</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/j.schlosser/Documents/New project/run_backfill.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>22</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/j.schlosser/Documents/New project/backfill.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/j.schlosser/Documents/New project/backfill_error.log</string>
</dict>
</plist>
```

**2. Load the agent:**
```bash
launchctl load ~/Library/LaunchAgents/com.wm2026.backfill.plist
```

**3. Verify it's running:**
```bash
launchctl list | grep wm2026
```

**4. To disable/remove:**
```bash
launchctl unload ~/Library/LaunchAgents/com.wm2026.backfill.plist
```

---

## Step 3: Monitor Progress

### During a run:
```bash
# Watch progress in real-time
tail -f "/Users/j.schlosser/Documents/New project/backfill.log"

# Check progress file
cat "/Users/j.schlosser/Documents/New project/backfill_progress.json"
```

### After completion:
```bash
# View final odds file
cat "/Users/j.schlosser/Documents/New project/wc_2026_odds_backfill.json" | head -50

# Check how many matches have odds
cat "/Users/j.schlosser/Documents/New project/wc_2026_odds_backfill.json" | grep -o '"matches"' | wc -l

# View summary
tail -30 "/Users/j.schlosser/Documents/New project/backfill.log"
```

---

## Step 4: Understand the Output Files

### `wc_2026_odds_backfill.json`
Main odds storage file:
```json
{
  "matches": {
    "2023-01-12T14:00:00Z_France_Australia": {
      "date": "2023-01-12T14:00:00Z",
      "home_team": "France",
      "away_team": "Australia",
      "odds": {
        "home": 1.45,
        "draw": 3.50,
        "away": 6.20,
        "bookmaker": "DraftKings",
        "market": "h2h"
      },
      "fetched_at": "2024-12-15T22:15:00Z"
    },
    ...
  },
  "meta": {
    "total_matches": 2888,
    "total_api_calls": 722,
    "last_updated": "2024-12-16T06:00:00Z",
    "coverage": "100.0%"
  }
}
```

### `backfill_progress.json`
Tracks which date ranges have been completed (for resume):
```json
{
  "completedDateRanges": [
    "Jan-Jun 2023",
    "Jul-Dec 2023"
  ],
  "matchesProcessed": 500,
  "startTime": "2024-12-15T22:00:00Z"
}
```

### `backfill.log`
Detailed run logs for debugging:
```
🎯 Historical Odds Backfill Script
📅 Started: [timestamp]
🔑 API Key: [first 8 chars]...
...
✅ Backfill Complete
   Total matches with odds: 2888 / 2,888
   Coverage: 100.0%
```

---

## Troubleshooting

### "Invalid API key"
```bash
# Verify key:
curl "https://api.the-odds-api.com/v4/sports?apiKey=YOUR_KEY"

# Should return: {"sports": [...]}
```

### "Insufficient API quota remaining"
- Your monthly quota is used up
- Wait until next month, or reduce run frequency
- Check The Odds API dashboard for quota details

### "Rate limited - waiting longer"
- API enforced stricter limits momentarily
- Script automatically retries with longer wait
- Normal behavior - not an error

### Script stops mid-run
- **This is OK** - check logs with: `tail backfill.log`
- Script auto-resumes next run from where it stopped
- Check `backfill_progress.json` for completion status

### Quota uses up before completion
- Reduce run frequency (run once per week instead of nightly)
- Reduce rate limit (run slower than 100/hour to preserve quota)
- Split across multiple months

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| **Phase 1: Backfill** | 1-8 hours total (can run nightly) | Starting now |
| **Phase 2: Optimize Weight** | 30 minutes (after backfill complete) | After Phase 1 |
| **Phase 3: Deploy** | Ongoing during WC 2026 | June 2026+ |

**Expected outcome after Phase 1:**
- ✅ 2,888 matches with historical odds
- ✅ Ready for weight optimization
- ✅ Accuracy improvement: 54.6% → ~56.4% (+1.8pp)

---

## Next Steps

1. **Confirm script works:** Run manual test first
2. **Set up automation:** Choose cron OR LaunchAgent
3. **Verify logs:** Check `backfill.log` after first run
4. **Once complete:** Run weight optimization script (I'll create next)

Any questions about setup? I can help with cron scheduling or debugging.
