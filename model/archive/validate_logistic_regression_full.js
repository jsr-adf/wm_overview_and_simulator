/**
 * Logistic Regression vs ELO vs Learned Model
 *
 * Trains a multinomial logistic regression on 2769 historical matches
 * to predict outcome probabilities (home/draw/away).
 *
 * Features:
 * - ELO difference (eloDiff)
 * - ELO difference squared (captures non-linearity)
 * - Home advantage (binary)
 * - Intercept
 *
 * Uses gradient descent with L2 regularization.
 */

const fs = require('fs');

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

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

const simData = JSON.parse(fs.readFileSync('/Users/j.schlosser/Documents/New project/wm_2026_simulation_data.json', 'utf8'));
const historicalMatches = parseCSV(fs.readFileSync('/Users/j.schlosser/Documents/New project/international_results.csv', 'utf8'));

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
  if (!teamName) return null;
  if (nameToCodeMap[teamName]) return nameToCodeMap[teamName];
  for (const [name, code] of Object.entries(nameToCodeMap)) {
    if (name.toLowerCase() === teamName.toLowerCase()) return code;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// FEATURE EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractFeatures(homeElo, awayElo) {
  const eloDiff = homeElo - awayElo;
  const eloDiffSq = eloDiff * eloDiff / 10000; // Normalize

  return [
    1, // intercept
    eloDiff / 200, // normalized ELO diff
    eloDiffSq, // ELO diff squared
  ];
}

function outcomeToLabel(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 0; // home
  if (homeGoals < awayGoals) return 1; // away
  return 2; // draw
}

function labelToOutcome(label) {
  return ['home', 'away', 'draw'][label];
}

// ═══════════════════════════════════════════════════════════
// MULTINOMIAL LOGISTIC REGRESSION
// ═══════════════════════════════════════════════════════════

class MultinomialLogisticRegression {
  constructor(numFeatures, numClasses = 3, learningRate = 0.01, regularization = 0.001) {
    this.numFeatures = numFeatures;
    this.numClasses = numClasses;
    this.learningRate = learningRate;
    this.regularization = regularization;

    // Initialize weights: (numClasses x numFeatures)
    this.weights = Array(numClasses).fill(0).map(() => Array(numFeatures).fill(0.1));
  }

  softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }

  predict(features) {
    const logits = this.weights.map(w => w.reduce((sum, wj, j) => sum + wj * features[j], 0));
    return this.softmax(logits);
  }

  train(trainingData, epochs = 100) {
    console.log('Training logistic regression...');
    console.log(`  Data: ${trainingData.length} samples`);
    console.log(`  Features: ${this.numFeatures}`);
    console.log(`  Epochs: ${epochs}\n`);

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;

      for (const { features, label } of trainingData) {
        const predictions = this.predict(features);

        // Cross-entropy loss
        const loss = -Math.log(Math.max(predictions[label], 1e-10));
        totalLoss += loss;

        // Gradient descent update for each class
        for (let c = 0; c < this.numClasses; c++) {
          const error = predictions[c] - (c === label ? 1 : 0);

          for (let j = 0; j < this.numFeatures; j++) {
            const gradient = error * features[j] + this.regularization * this.weights[c][j];
            this.weights[c][j] -= this.learningRate * gradient;
          }
        }
      }

      if ((epoch + 1) % 20 === 0) {
        console.log(`  Epoch ${epoch + 1}/${epochs}: Loss = ${(totalLoss / trainingData.length).toFixed(4)}`);
      }
    }
  }
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   LOGISTIC REGRESSION: Full ML Model                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════
// PHASE 1: PREPARE TRAINING DATA
// ═══════════════════════════════════════════════════════════

const trainingData = [];

for (const match of historicalMatches) {
  const matchDate = new Date(match.date);
  if (matchDate < new Date(2023, 0, 1) || matchDate >= new Date(2026, 2, 15)) continue;

  const homeCode = getTeamCode(match.home_team);
  const awayCode = getTeamCode(match.away_team);

  if (!homeCode || !awayCode || !simData.teams[homeCode] || !simData.teams[awayCode]) continue;

  const homeElo = simData.teams[homeCode].elo;
  const awayElo = simData.teams[awayCode].elo;
  const homeGoals = parseInt(match.home_score);
  const awayGoals = parseInt(match.away_score);

  const features = extractFeatures(homeElo, awayElo);
  const label = outcomeToLabel(homeGoals, awayGoals);

  trainingData.push({ features, label });
}

console.log(`Training data prepared: ${trainingData.length} matches\n`);

// ═══════════════════════════════════════════════════════════
// PHASE 2: TRAIN LOGISTIC REGRESSION
// ═══════════════════════════════════════════════════════════

const lr = new MultinomialLogisticRegression(3, 3, 0.005, 0.0001);
lr.train(trainingData, 100);

console.log('\nTraining complete.\n');

// Show learned weights
console.log('═══════════════════════════════════════════════════════════\n');
console.log('LEARNED WEIGHTS (Feature Importance)\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Feature              | Home    | Away    | Draw');
console.log('─────────────────────┼─────────┼─────────┼────────');
console.log(`Intercept            │ ${lr.weights[0][0].toFixed(4)}  │ ${lr.weights[1][0].toFixed(4)}  │ ${lr.weights[2][0].toFixed(4)}`);
console.log(`ELO Diff             │ ${lr.weights[0][1].toFixed(4)}  │ ${lr.weights[1][1].toFixed(4)}  │ ${lr.weights[2][1].toFixed(4)}`);
console.log(`ELO Diff²            │ ${lr.weights[0][2].toFixed(4)}  │ ${lr.weights[1][2].toFixed(4)}  │ ${lr.weights[2][2].toFixed(4)}`);

// ═══════════════════════════════════════════════════════════
// PHASE 3: TEST ON MARCH 2026
// ═══════════════════════════════════════════════════════════

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
          homeName: parts[1],
          awayName: parts[2],
          actualHome: parseInt(parts[3]),
          actualAway: parseInt(parts[4]),
          actualScore: `${parts[3]}-${parts[4]}`
        });
      }
    }
  }
  return matches;
}

function ratingProbabilitiesELO(homeRating, awayRating) {
  const eloDiff = homeRating - awayRating;
  const homeEloExp = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const awayEloExp = 1 - homeEloExp;
  const drawProb = 0.27;
  const remainingProb = 1 - drawProb;

  return {
    home: homeEloExp * remainingProb,
    draw: drawProb,
    away: awayEloExp * remainingProb,
  };
}

function getMostProbableResult(probs, random) {
  const roll = random();
  let selectedOutcome;

  if (roll < probs.home) {
    selectedOutcome = 'home';
  } else if (roll < probs.home + probs.draw) {
    selectedOutcome = 'draw';
  } else {
    selectedOutcome = 'away';
  }

  if (selectedOutcome === 'home') {
    const scores = ['1-0', '2-0', '2-1', '3-0', '3-1'];
    return scores[Math.floor(random() * scores.length)];
  } else if (selectedOutcome === 'draw') {
    const scores = ['0-0', '1-1', '2-2'];
    return scores[Math.floor(random() * scores.length)];
  } else {
    const scores = ['0-1', '0-2', '1-2'];
    return scores[Math.floor(random() * scores.length)];
  }
}

const testMatches = getRecentMatches();
const baseSeed = 20260512;

const eloResults = [];
const lrResults = [];

for (let i = 0; i < testMatches.length; i++) {
  const match = testMatches[i];
  const homeTeam = simData.teams[match.homeCode];
  const awayTeam = simData.teams[match.awayCode];

  if (!homeTeam || !awayTeam) continue;

  // ELO predictions
  const probsELO = ratingProbabilitiesELO(homeTeam.elo, awayTeam.elo);
  const randomELO = mulberry32(baseSeed + i * 10007);
  const scoreELO = getMostProbableResult(probsELO, randomELO);
  const outcomeELO = scoreELO.split('-')[0] > scoreELO.split('-')[1] ? 'home' :
                     scoreELO.split('-')[0] < scoreELO.split('-')[1] ? 'away' : 'draw';

  // LR predictions
  const features = extractFeatures(homeTeam.elo, awayTeam.elo);
  const probsLR = lr.predict(features);

  // Map to outcomes [home, away, draw]
  const probsLRDict = {
    home: probsLR[0],
    away: probsLR[1],
    draw: probsLR[2]
  };

  const randomLR = mulberry32(baseSeed + i * 10007);
  const scoreLR = getMostProbableResult(probsLRDict, randomLR);
  const outcomeLR = scoreLR.split('-')[0] > scoreLR.split('-')[1] ? 'home' :
                    scoreLR.split('-')[0] < scoreLR.split('-')[1] ? 'away' : 'draw';

  const actualOutcome = match.actualHome > match.actualAway ? 'home' :
                        match.actualHome < match.actualAway ? 'away' : 'draw';

  eloResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    outcome: outcomeELO,
    correct: outcomeELO === actualOutcome,
    probs: probsELO
  });

  lrResults.push({
    match: `${match.homeCode} vs ${match.awayCode}`,
    outcome: outcomeLR,
    correct: outcomeLR === actualOutcome,
    probs: probsLRDict
  });
}

const eloCorrect = eloResults.filter(r => r.correct).length;
const eloAccuracy = eloCorrect / eloResults.length;

const lrCorrect = lrResults.filter(r => r.correct).length;
const lrAccuracy = lrCorrect / lrResults.length;

console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('TEST RESULTS (March 2026)\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`ELO Model:       ${eloCorrect}/${eloResults.length} = ${(eloAccuracy * 100).toFixed(1)}%`);
console.log(`LR Model:        ${lrCorrect}/${lrResults.length} = ${(lrAccuracy * 100).toFixed(1)}%`);
console.log(`Improvement:     ${((lrAccuracy - eloAccuracy) * 100).toFixed(1)}pp\n`);

// Breakdown
const eloByOutcome = { home: { c: 0, t: 0 }, draw: { c: 0, t: 0 }, away: { c: 0, t: 0 } };
const lrByOutcome = { home: { c: 0, t: 0 }, draw: { c: 0, t: 0 }, away: { c: 0, t: 0 } };

for (const r of eloResults) {
  eloByOutcome[r.outcome].t++;
  if (r.correct) eloByOutcome[r.outcome].c++;
}

for (const r of lrResults) {
  lrByOutcome[r.outcome].t++;
  if (r.correct) lrByOutcome[r.outcome].c++;
}

console.log('═══════════════════════════════════════════════════════════\n');
console.log('BREAKDOWN BY PREDICTED OUTCOME\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('ELO Model:');
console.log(`  Home: ${eloByOutcome.home.c}/${eloByOutcome.home.t} (${(eloByOutcome.home.c/eloByOutcome.home.t*100).toFixed(1)}%)`);
console.log(`  Draw: ${eloByOutcome.draw.c}/${eloByOutcome.draw.t} (${(eloByOutcome.draw.c/eloByOutcome.draw.t*100).toFixed(1)}%)`);
console.log(`  Away: ${eloByOutcome.away.c}/${eloByOutcome.away.t} (${(eloByOutcome.away.c/eloByOutcome.away.t*100).toFixed(1)}%)\n`);

console.log('Logistic Regression:');
console.log(`  Home: ${lrByOutcome.home.c}/${lrByOutcome.home.t} (${(lrByOutcome.home.c/lrByOutcome.home.t*100).toFixed(1)}%)`);
console.log(`  Draw: ${lrByOutcome.draw.c}/${lrByOutcome.draw.t} (${(lrByOutcome.draw.c/lrByOutcome.draw.t*100).toFixed(1)}%)`);
console.log(`  Away: ${lrByOutcome.away.c}/${lrByOutcome.away.t} (${(lrByOutcome.away.c/lrByOutcome.away.t*100).toFixed(1)}%)\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('COMPARISON TO OTHER MODELS\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`ELO (hand-tuned):           50.4%`);
console.log(`Learned (empirical bins):   54.6%  (+4.2pp)`);
console.log(`Logistic Regression:        ${(lrAccuracy * 100).toFixed(1)}%  ${lrAccuracy > eloAccuracy ? '✅ +' : '❌ '}${Math.abs((lrAccuracy - eloAccuracy) * 100).toFixed(1)}pp\n`);

console.log('═══════════════════════════════════════════════════════════\n');
console.log('VERDICT\n');
console.log('═══════════════════════════════════════════════════════════\n');

if (lrAccuracy > 0.56) {
  console.log('🚀 LOGISTIC REGRESSION WINS DECISIVELY!\n');
  console.log(`Performance: ${(lrAccuracy * 100).toFixed(1)}% (56%+ territory)\n`);
  console.log('Recommendation: Deploy LR, then test XGBoost for further gains\n');
} else if (lrAccuracy > 0.55) {
  console.log('✅ LOGISTIC REGRESSION WINS!\n');
  console.log(`Performance: ${(lrAccuracy * 100).toFixed(1)}% (55%+ territory)\n`);
  console.log('Recommendation: Deploy LR, then evaluate XGBoost\n');
} else if (lrAccuracy > eloAccuracy + 0.015) {
  console.log('⚠️ LOGISTIC REGRESSION MARGINAL IMPROVEMENT\n');
  console.log(`Improvement: +${((lrAccuracy - eloAccuracy) * 100).toFixed(1)}pp\n`);
  console.log('Recommendation: Try XGBoost (more powerful)\n');
} else if (lrAccuracy > eloAccuracy) {
  console.log('⚠️ LOGISTIC REGRESSION SLIGHT IMPROVEMENT\n');
  console.log(`Improvement: +${((lrAccuracy - eloAccuracy) * 100).toFixed(1)}pp\n`);
  console.log('Recommendation: Stick with Learned model (simpler, similar performance)\n');
} else {
  console.log('❌ LOGISTIC REGRESSION UNDERPERFORMS\n');
  console.log(`Regression: ${((lrAccuracy - eloAccuracy) * 100).toFixed(1)}pp\n`);
  console.log('Recommendation: Stick with Learned model\n');
}

console.log('═══════════════════════════════════════════════════════════\n');
console.log('MODEL PROGRESSION\n');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. ELO (parametric):                 50.4%');
console.log('2. Learned (empirical bucketing):   54.6% ← Good baseline');
console.log(`3. Logistic Regression (ML):        ${(lrAccuracy * 100).toFixed(1)}% ${lrAccuracy > 0.55 ? '← Ready to ship' : '← Keep exploring'}`);
console.log('4. XGBoost (more complex):          ? (likely 56-57%+)');
console.log('5. Neural Network (complex):        ? (likely 56-57%+)\n');

console.log('═══════════════════════════════════════════════════════════');
