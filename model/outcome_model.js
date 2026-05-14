/**
 * Match Outcome Prediction Model
 * Predicts H/D/A (not exact scores) - much more tractable problem
 *
 * Approach: Use ELO rating difference to calculate win probabilities
 * Then validate against recent matches
 */

const fs = require('fs');

// Simple CSV parser
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j];
    }
    records.push(record);
  }

  return records;
}

// Load data
const simData = JSON.parse(fs.readFileSync('/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json', 'utf8'));
const historicalMatches = parseCSV(fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8'));

// Team mapping
const nameToCodeMap = {
  'United States': 'USA', 'Türkiye': 'TUR', 'Turkey': 'TUR',
  'Korea Republic': 'KOR', 'South Korea': 'KOR',
  'Czech Republic': 'CZE', 'Czechia': 'CZE',
  'China PR': 'CHN', 'Northern Ireland': 'NIR', 'Wales': 'WAL',
  'Scotland': 'SCO', 'England': 'ENG',
};

for (const [code, team] of Object.entries(simData.teams)) {
  if (!nameToCodeMap[team.name]) {
    nameToCodeMap[team.name] = code;
  }
}

function getTeamCode(teamName) {
  if (nameToCodeMap[teamName]) {
    return nameToCodeMap[teamName];
  }
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) {
      return code;
    }
  }
  return null;
}

// Build ELO map
const eloMap = {};
for (const [code, team] of Object.entries(simData.teams)) {
  eloMap[code] = team.elo;
}

/**
 * ELO-based outcome probabilities
 * Using Elo difference to predict match outcomes
 *
 * Formula: P(home wins) = 1 / (1 + 10^(-eloDiff/400))
 * Then distribute remaining probability to draw and away win
 *
 * Empirical from calibration data:
 * - Draw rate: 23.15%
 * - Home win rate (non-neutral): 50.83%
 * - Away win rate (non-neutral): 26.02% (100 - 50.83 - 23.15)
 */
function predictOutcome(homeCode, awayCode) {
  const homeElo = eloMap[homeCode];
  const awayElo = eloMap[awayCode];

  if (!homeElo || !awayElo) {
    // Fallback: use historical rates
    return {
      homeWin: 0.5083,
      draw: 0.2315,
      awayWin: 0.2602
    };
  }

  const eloDiff = homeElo - awayElo;

  // Elo expected score (0 to 1)
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;

  // Map to H/D/A outcomes
  // Higher ELO diff → more likely home win
  // But calibrate to historical draw rate

  // Allocate 27% to draw (updated from 0.2315 based on Jan-Mar 2026 data)
  const drawProb = 0.27;

  // Remaining 76.85% split between home and away based on ELO
  const remainingProb = 1 - drawProb;

  // Normalize ELO expectations to remaining probability
  const homeWinProb = homeEloExp * remainingProb;
  const awayWinProb = awayEloExp * remainingProb;

  return {
    homeWin: homeWinProb,
    draw: drawProb,
    awayWin: awayWinProb
  };
}

/**
 * Get actual outcome
 */
function getActualOutcome(homeGoals, awayGoals) {
  if (homeGoals === awayGoals) return 'draw';
  if (homeGoals > awayGoals) return 'home';
  return 'away';
}

/**
 * Get recent test matches
 */
function getRecentMatches() {
  const lines = fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8').split('\n').slice(1);

  const targetDate = new Date(2026, 4, 12);
  const sixtyDaysAgo = new Date(targetDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  const matches = [];

  for (const line of lines) {
    const parts = line.split(',');
    if (!parts[0]) continue;

    const matchDate = new Date(parts[0]);
    if (matchDate >= sixtyDaysAgo && matchDate <= targetDate) {
      const homeCode = getTeamCode(parts[1]);
      const awayCode = getTeamCode(parts[2]);

      if (homeCode && awayCode) {
        matches.push({
          homeCode,
          awayCode,
          actualHome: parseInt(parts[3]),
          actualAway: parseInt(parts[4])
        });
      }
    }
  }

  return matches;
}

/**
 * Validate model
 */
console.log('=== Outcome Prediction Model ===\n');

const testMatches = getRecentMatches();
console.log(`Test set: ${testMatches.length} recent matches\n`);

let correctPredictions = 0;
let logLoss = 0; // For probabilistic evaluation

const predictions = [];
const actuals = [];

for (const match of testMatches) {
  const probs = predictOutcome(match.homeCode, match.awayCode);
  const actualOutcome = getActualOutcome(match.actualHome, match.actualAway);

  // Predicted outcome (highest probability)
  let predOutcome;
  let maxProb = 0;
  if (probs.homeWin >= probs.draw && probs.homeWin >= probs.awayWin) {
    predOutcome = 'home';
    maxProb = probs.homeWin;
  } else if (probs.draw >= probs.awayWin) {
    predOutcome = 'draw';
    maxProb = probs.draw;
  } else {
    predOutcome = 'away';
    maxProb = probs.awayWin;
  }

  if (predOutcome === actualOutcome) {
    correctPredictions++;
  }

  // Log loss: -log(predicted_probability_of_actual_outcome)
  const actualProb = probs[actualOutcome === 'home' ? 'homeWin' : actualOutcome === 'draw' ? 'draw' : 'awayWin'];
  logLoss += -Math.log(Math.max(actualProb, 0.001)); // Avoid log(0)

  predictions.push({
    pred: predOutcome,
    probs,
    actual: actualOutcome,
    correct: predOutcome === actualOutcome
  });

  actuals.push(actualOutcome);
}

const accuracy = correctPredictions / testMatches.length;
const avgLogLoss = logLoss / testMatches.length;

console.log(`Results:`);
console.log(`  Accuracy: ${correctPredictions}/${testMatches.length} (${(accuracy * 100).toFixed(1)}%)`);
console.log(`  Log Loss: ${avgLogLoss.toFixed(4)}`);
console.log(`  Baseline accuracy (always pick most likely outcome): 50.83%`);

// Calibration: how well do predicted probabilities match actual frequencies?
const homeWinPreds = predictions.filter(p => p.probs.homeWin > p.probs.draw && p.probs.homeWin > p.probs.awayWin);
const homeWinActual = homeWinPreds.filter(p => p.actual === 'home').length / homeWinPreds.length;

console.log(`\nCalibration:`);
console.log(`  Home win predictions accuracy: ${(homeWinActual * 100).toFixed(1)}%`);

// Save results
const results = {
  model: 'outcome_prediction_elo',
  testSize: testMatches.length,
  accuracy: accuracy.toFixed(4),
  logLoss: avgLogLoss.toFixed(4),
  correctPredictions,
  timestamp: new Date().toISOString()
};

fs.writeFileSync(
  '/Users/j.schlosser/Documents/New project/outcome_model_results.json',
  JSON.stringify(results, null, 2)
);

console.log(`\nResults saved to outcome_model_results.json`);

// For WC 2026 predictions using this model
console.log(`\n=== WC 2026 Predictions (using Outcome Model) ===\n`);

const wcMatches = simData.matches;
let wcHomeWins = 0;
let wcDraws = 0;
let wcAwayWins = 0;

for (let i = 0; i < Math.min(10, wcMatches.length); i++) {
  const match = wcMatches[i];
  const probs = predictOutcome(match.home.code, match.away.code);

  let outcome;
  if (probs.homeWin > probs.draw && probs.homeWin > probs.awayWin) {
    outcome = '🏠 ' + match.home.name;
  } else if (probs.draw > probs.awayWin) {
    outcome = '🤝 Draw';
  } else {
    outcome = '🚀 ' + match.away.name;
  }

  console.log(
    `${match.home.code} vs ${match.away.code}: ${outcome} ` +
    `(H:${(probs.homeWin*100).toFixed(0)}% D:${(probs.draw*100).toFixed(0)}% A:${(probs.awayWin*100).toFixed(0)}%)`
  );
}

// Aggregate for full tournament
for (const match of wcMatches) {
  const probs = predictOutcome(match.home.code, match.away.code);

  if (probs.homeWin > probs.draw && probs.homeWin > probs.awayWin) {
    wcHomeWins++;
  } else if (probs.draw > probs.awayWin) {
    wcDraws++;
  } else {
    wcAwayWins++;
  }
}

console.log(`\nFull WC 2026 prediction distribution:`);
console.log(`  Home wins: ${wcHomeWins} (${(wcHomeWins/72*100).toFixed(1)}%)`);
console.log(`  Draws: ${wcDraws} (${(wcDraws/72*100).toFixed(1)}%)`);
console.log(`  Away wins: ${wcAwayWins} (${(wcAwayWins/72*100).toFixed(1)}%)`);

