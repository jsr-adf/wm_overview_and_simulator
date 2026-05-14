#!/usr/bin/env node
/**
 * Automated Historical Odds Backfill Script
 * Uses Odds-API.io v3 API - searches for specific WC 2026 matches
 *
 * Pulls historical odds for 2,888 training + testing matches
 * Uses /events/search to find matches by team names and dates
 * Resumable: tracks which matches have been processed
 * Storage: wc_2026_odds_backfill.json
 *
 * Usage:
 *   node backfill_historical_odds.js [API_KEY]
 *
 * Automation (macOS/Linux cron):
 *   0 22 * * * cd /Users/j.schlosser/Documents/New\ project && source .env && node backfill_historical_odds.js "$ODDS_API_KEY" >> backfill.log 2>&1
 */

const https = require('https');
const fs = require('fs');

// Configuration
const CONFIG = {
  apiKey: process.argv[2] || process.env.ODDS_API_KEY,
  baseUrl: 'https://api.odds-api.io/v3',
  rateLimit: 300, // 300ms between calls
  outputFile: 'wc_2026_odds_backfill.json',
  progressFile: 'backfill_progress.json',
  dataFile: 'wm_2026_simulation_data.json'
};

// Validation
if (!CONFIG.apiKey) {
  console.error('ERROR: API key required');
  console.error('Usage: node backfill_historical_odds.js YOUR_API_KEY');
  process.exit(1);
}

/**
 * Sleep for milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTTP GET request
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

/**
 * Search for a specific match
 */
async function searchMatch(apiKey, query) {
  const params = new URLSearchParams({ apiKey, query });
  const url = `${CONFIG.baseUrl}/events/search?${params}`;

  try {
    const response = await httpGet(url);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(response.body) || [];
  } catch (error) {
    return [];
  }
}

/**
 * Fetch odds for an event
 */
async function fetchOdds(apiKey, eventId, bookmakers = 'Bet365,Unibet') {
  const params = new URLSearchParams({ apiKey, eventId, bookmakers });
  const url = `${CONFIG.baseUrl}/odds?${params}`;

  try {
    const response = await httpGet(url);
    if (response.status >= 400) return null;
    return JSON.parse(response.body);
  } catch (error) {
    return null;
  }
}

/**
 * Extract odds from event data
 */
function extractOdds(eventOdds) {
  if (!eventOdds || !eventOdds.bookmakers) return null;

  const prices = [];
  for (const [bookmaker, markets] of Object.entries(eventOdds.bookmakers || {})) {
    if (!Array.isArray(markets)) continue;
    for (const market of markets) {
      const name = (market.name || '').toLowerCase();
      if (!['ml', 'moneyline', 'match winner', '1x2', 'h2h'].includes(name)) continue;
      if (!Array.isArray(market.odds)) continue;
      for (const odd of market.odds) {
        const h = parseFloat(odd.home);
        const d = parseFloat(odd.draw);
        const a = parseFloat(odd.away);
        if (h > 1 && d > 1 && a > 1) {
          prices.push({ bookmaker, home: h, draw: d, away: a });
        }
      }
    }
  }

  if (prices.length === 0) return null;
  const avg = {
    home: prices.reduce((s, p) => s + p.home, 0) / prices.length,
    draw: prices.reduce((s, p) => s + p.draw, 0) / prices.length,
    away: prices.reduce((s, p) => s + p.away, 0) / prices.length
  };

  return {
    home: Math.round(avg.home * 1000) / 1000,
    draw: Math.round(avg.draw * 1000) / 1000,
    away: Math.round(avg.away * 1000) / 1000,
    bookmakerCount: prices.length
  };
}

/**
 * Normalize team names for searching
 */
function normalizeTeam(name) {
  const aliases = {
    'usa': 'united states',
    'korea republic': 'south korea',
    'ir iran': 'iran',
    'türkiye': 'turkey',
    'czechia': 'czech republic'
  };
  const cleaned = name.toLowerCase().trim();
  return aliases[cleaned] || cleaned;
}

/**
 * Load progress
 */
function loadProgress() {
  try {
    if (fs.existsSync(CONFIG.progressFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf8'));
    }
  } catch (e) {
    console.warn('⚠️  Could not load progress, starting fresh');
  }
  return { processedMatches: [], startTime: new Date().toISOString() };
}

/**
 * Save progress
 */
function saveProgress(progress) {
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2));
}

/**
 * Load existing odds
 */
function loadOdds() {
  try {
    if (fs.existsSync(CONFIG.outputFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    }
  } catch (e) {
    console.warn('⚠️  Could not load odds file, starting fresh');
  }
  return { matches: {} };
}

/**
 * Main function
 */
async function main() {
  console.log('🎯 Historical Odds Backfill (Odds-API.io v3)');
  console.log(`📅 Started: ${new Date().toLocaleString()}`);
  console.log(`🔑 API Key: ${CONFIG.apiKey.slice(0, 8)}...`);
  console.log('---');

  try {
    // Load match data from FIFA file
    const matchData = JSON.parse(fs.readFileSync('wm_2026_matches_fifa.json', 'utf8'));

    // Flatten matches from Results array
    const allMatches = [];
    for (const match of matchData.Results || []) {
      const home = match.Home?.TeamName?.[0]?.Description || match.Home?.ShortClubName;
      const away = match.Away?.TeamName?.[0]?.Description || match.Away?.ShortClubName;
      const date = match.Date || match.LocalDate;

      if (home && away && date) {
        allMatches.push({ home, away, date });
      }
    }

    console.log(`📦 Loaded ${allMatches.length} WC 2026 matches`);
    console.log('---');

    const progress = loadProgress();
    const odds = loadOdds();

    let successCount = 0;
    let lastCallTime = 0;

    // Process each match
    for (let i = 0; i < allMatches.length; i++) {
      const match = allMatches[i];
      const matchKey = `${match.date}_${match.home}_${match.away}`;

      // Skip if already processed
      if (progress.processedMatches.includes(matchKey)) {
        continue;
      }

      // Search for the match
      process.stdout.write(`\r[${i + 1}/${allMatches.length}] ${match.home} vs ${match.away}...`);

      // Rate limit
      const now = Date.now();
      if (lastCallTime > 0 && now - lastCallTime < CONFIG.rateLimit) {
        await sleep(CONFIG.rateLimit - (now - lastCallTime));
      }
      lastCallTime = Date.now();

      try {
        // Search for event
        const query = `${match.home} ${match.away}`;
        const results = await searchMatch(CONFIG.apiKey, query);

        let found = false;
        if (Array.isArray(results)) {
          // Find the match that has the right teams and date
          const targetHome = normalizeTeam(match.home);
          const targetAway = normalizeTeam(match.away);
          const targetDate = match.date.slice(0, 10);

          for (const event of results) {
            const eventHome = normalizeTeam(event.home);
            const eventAway = normalizeTeam(event.away);
            const eventDate = event.date.slice(0, 10);

            if (
              {eventHome, eventAway} === {targetHome, targetAway} &&
              eventDate === targetDate
            ) {
              // Found it! Fetch odds
              const eventOdds = await fetchOdds(CONFIG.apiKey, event.id);
              if (eventOdds) {
                const extracted = extractOdds(eventOdds);
                if (extracted && extracted.home && extracted.draw && extracted.away) {
                  odds.matches[matchKey] = {
                    date: match.date,
                    home_team: match.home,
                    away_team: match.away,
                    event_id: event.id,
                    odds: extracted,
                    fetched_at: new Date().toISOString()
                  };
                  successCount++;
                  found = true;
                  break;
                }
              }
            }
          }
        }

        progress.processedMatches.push(matchKey);
        if (i % 50 === 0 && i > 0) {
          saveProgress(progress);
        }

      } catch (error) {
        console.error(`\n❌ Error on ${match.home} vs ${match.away}: ${error.message}`);
      }
    }

    console.log(`\r✅ Processed all ${allMatches.length} matches`);

    // Save final results
    odds.meta = {
      provider: 'Odds-API.io v3',
      total_matches: Object.keys(odds.matches).length,
      coverage: `${((Object.keys(odds.matches).length / allMatches.length) * 100).toFixed(1)}%`,
      last_updated: new Date().toISOString()
    };

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(odds, null, 2));
    fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2));

    console.log('\n---');
    console.log('✅ Backfill Complete');
    console.log(`   Matches with odds: ${Object.keys(odds.matches).length}`);
    console.log(`   Coverage: ${odds.meta.coverage}%`);
    console.log(`   File: ${CONFIG.outputFile}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
